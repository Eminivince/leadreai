import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

// ---------------------------------------------------------------------------
// Inline Mongoose models (strict:false — workers never import from backend)
// ---------------------------------------------------------------------------
const workspaceSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Workspace: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['Workspace'] as mongoose.Model<any> | undefined) ??
  mongoose.model('Workspace', workspaceSchema, 'workspaces');

const leadSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Lead: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['Lead'] as mongoose.Model<any> | undefined) ??
  mongoose.model('Lead', leadSchema, 'leads');

const contactSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Contact: mongoose.Model<any> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mongoose.models['Contact'] as mongoose.Model<any> | undefined) ??
  mongoose.model('Contact', contactSchema, 'contacts');

// ---------------------------------------------------------------------------
// Inlined decrypt — mirrors backend/src/utils/encrypt.ts
// Encryption key: derived from JWT_SECRET via scrypt (same salt)
// ---------------------------------------------------------------------------
function getDecryptKey(): Buffer {
  const secret = env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set — cannot decrypt HubSpot tokens');
  return scryptSync(secret, 'leadreai-email-salt', 32);
}

function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid ciphertext format');
  const key = getDecryptKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8');
}

// Inlined encrypt — mirrors backend/src/utils/encrypt.ts (same key derivation)
function encryptInline(plaintext: string): string {
  const iv = randomBytes(16);
  const key = getDecryptKey();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Token refresh helper (inlined — worker cannot import from backend)
// ---------------------------------------------------------------------------
async function maybeRefreshHubSpotToken(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  workspaceId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  WorkspaceModel: mongoose.Model<any>;
}): Promise<string> {
  const fiveMinutes = 5 * 60 * 1000;
  if (tokens.expiresAt.getTime() - Date.now() > fiveMinutes) {
    return tokens.accessToken; // still fresh
  }

  const clientId = process.env['HUBSPOT_CLIENT_ID'];
  const clientSecret = process.env['HUBSPOT_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    logger.warn('hubspot.worker: cannot refresh token — HUBSPOT_CLIENT_ID/SECRET not set');
    return tokens.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
  });

  const resp = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    logger.warn('hubspot.worker: token refresh failed, using existing token', { status: resp.status });
    return tokens.accessToken;
  }

  const data = await resp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Persist refreshed tokens back to workspace (encrypted inline)
  await tokens.WorkspaceModel.updateOne(
    { _id: tokens.workspaceId },
    {
      $set: {
        'crmConfig.hubspot.accessToken': encryptInline(data.access_token),
        'crmConfig.hubspot.refreshToken': encryptInline(data.refresh_token),
        'crmConfig.hubspot.expiresAt': newExpiresAt,
      },
    }
  );

  logger.info('hubspot.worker: token refreshed successfully', { workspaceId: tokens.workspaceId });
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Inlined HubSpot API helpers (workers cannot import from backend)
// ---------------------------------------------------------------------------
async function hubspotRequest(
  accessToken: string,
  method: string,
  url: string,
  body?: unknown
): Promise<unknown> {
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HubSpot API error ${resp.status} ${method} ${url}: ${text}`);
  }
  return resp.json();
}

async function upsertCompany(accessToken: string, company: {
  name: string;
  domain?: string;
  industry?: string;
  city?: string;
  country?: string;
}): Promise<{ id: string; status: 'created' | 'existing' }> {
  let input: Record<string, unknown>;
  if (company.domain) {
    input = {
      idProperty: 'domain',
      id: company.domain,
      properties: {
        name: company.name,
        domain: company.domain,
        industry: company.industry,
        city: company.city,
        country: company.country,
      },
    };
  } else {
    input = {
      properties: {
        name: company.name,
        industry: company.industry,
        city: company.city,
        country: company.country,
      },
    };
  }
  const result = await hubspotRequest(
    accessToken,
    'POST',
    'https://api.hubapi.com/crm/v3/objects/companies/batch/upsert',
    { inputs: [input] }
  ) as { results: Array<{ id: string; status: string }> };
  const first = result.results[0];
  if (!first) throw new Error('HubSpot returned empty results for company upsert');
  return { id: first.id, status: first.status === 'CREATED' ? 'created' : 'existing' };
}

async function upsertContact(accessToken: string, contact: {
  firstName?: string;
  lastName?: string;
  email?: string;
  jobTitle?: string;
}): Promise<{ id: string; status: 'created' | 'existing' }> {
  let input: Record<string, unknown>;
  if (contact.email) {
    input = {
      idProperty: 'email',
      id: contact.email,
      properties: {
        firstname: contact.firstName,
        lastname: contact.lastName,
        email: contact.email,
        jobtitle: contact.jobTitle,
      },
    };
  } else {
    input = {
      properties: {
        firstname: contact.firstName,
        lastname: contact.lastName,
        jobtitle: contact.jobTitle,
      },
    };
  }
  const result = await hubspotRequest(
    accessToken,
    'POST',
    'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert',
    { inputs: [input] }
  ) as { results: Array<{ id: string; status: string }> };
  const first = result.results[0];
  if (!first) throw new Error('HubSpot returned empty results for contact upsert');
  return { id: first.id, status: first.status === 'CREATED' ? 'created' : 'existing' };
}

async function associateContactToCompany(
  accessToken: string,
  contactId: string,
  companyId: string
): Promise<void> {
  await hubspotRequest(
    accessToken,
    'PUT',
    'https://api.hubapi.com/crm/v4/associations/contacts/companies/batch/create',
    {
      inputs: [
        {
          from: { id: contactId },
          to: { id: companyId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }],
        },
      ],
    }
  );
}

// ---------------------------------------------------------------------------
// Job payload
// ---------------------------------------------------------------------------
export interface HubSpotSyncPayload {
  workspaceId: string;
  direction: 'push' | 'pull' | 'full';
  leadIds?: string[];
  triggeredBy: 'manual' | 'auto_job_complete' | 'scheduled';
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------
async function processHubspotSync(job: Job<HubSpotSyncPayload>): Promise<void> {
  const { workspaceId, direction, leadIds } = job.data;
  logger.info('hubspot.worker: processing', { jobId: job.id, workspaceId, direction });

  if (direction === 'pull') {
    logger.info('hubspot.worker: pull not yet implemented', { workspaceId });
    return;
  }

  // 1. Load workspace with encrypted tokens
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspace = await Workspace.findById(workspaceId)
    .select('+crmConfig.hubspot.accessToken +crmConfig.hubspot.refreshToken');

  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const hs = workspace.crmConfig?.hubspot;
  if (!hs?.accessToken) throw new Error('HubSpot not connected for this workspace');

  // 2. Decrypt tokens
  const decryptedAccess = decrypt(hs.accessToken as string);
  const decryptedRefresh = hs.refreshToken ? decrypt(hs.refreshToken as string) : '';

  // 3. Refresh token if near expiry
  const accessToken = await maybeRefreshHubSpotToken({
    accessToken: decryptedAccess,
    refreshToken: decryptedRefresh,
    expiresAt: hs.expiresAt ? new Date(hs.expiresAt as string) : new Date(0),
    workspaceId,
    WorkspaceModel: Workspace,
  });

  // 4. Load leads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leads: any[];
  if (leadIds && leadIds.length > 0) {
    leads = await Lead.find({
      _id: { $in: leadIds.map((id) => new mongoose.Types.ObjectId(id)) },
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
    });
  } else {
    leads = await Lead.find({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      companyDomain: { $exists: true, $ne: '' },
    }).limit(200);
  }

  logger.info('hubspot.worker: syncing leads', { count: leads.length, workspaceId });

  let companiesSynced = 0;
  let contactsSynced = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      // 5. Upsert company
      const companyResult = await upsertCompany(accessToken, {
        name: lead.companyName,
        domain: lead.companyDomain,
        industry: lead.industry,
        city: lead.address?.city,
        country: lead.address?.country,
      });
      companiesSynced++;

      // Store hubspot company ref on lead (best-effort)
      await Lead.updateOne(
        { _id: lead._id },
        {
          $set: {
            'crmRefs': [
              {
                provider: 'hubspot',
                externalId: companyResult.id,
                syncedAt: new Date(),
                syncStatus: 'synced',
              },
            ],
          },
        }
      );

      // 6. Load contacts for this lead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contacts: any[] = await Contact.find({
        leadId: lead._id,
        isActive: true,
      });

      for (const contact of contacts) {
        try {
          const primaryEmail = (contact.emails?.[0]?.address) as string | undefined;

          // Skip contacts with no email and no name
          if (!contact.fullName && !primaryEmail) continue;

          const contactResult = await upsertContact(accessToken, {
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: primaryEmail,
            jobTitle: contact.title,
          });
          contactsSynced++;

          // Associate contact to company
          await associateContactToCompany(accessToken, contactResult.id, companyResult.id);

          // Store crmRef on contact
          await Contact.updateOne(
            { _id: contact._id },
            {
              $set: {
                crmRefs: [
                  {
                    provider: 'hubspot',
                    externalId: contactResult.id,
                    syncedAt: new Date(),
                    syncStatus: 'synced',
                  },
                ],
              },
            }
          );
        } catch (contactErr) {
          errors++;
          logger.warn('hubspot.worker: contact upsert failed', {
            contactId: contact._id,
            err: contactErr instanceof Error ? contactErr.message : String(contactErr),
          });
        }
      }
    } catch (leadErr) {
      errors++;
      logger.warn('hubspot.worker: lead upsert failed', {
        leadId: lead._id,
        err: leadErr instanceof Error ? leadErr.message : String(leadErr),
      });
    }
  }

  // 7. Write sync log entry
  await Workspace.updateOne(
    { _id: workspaceId },
    {
      $set: { 'crmConfig.hubspot.lastSyncAt': new Date() },
      $push: {
        'crmConfig.hubspot.syncLog': {
          $each: [{ syncedAt: new Date(), direction, companiesSynced, contactsSynced, errors }],
          $slice: -50,
        },
      },
    }
  );

  logger.info('hubspot.worker: sync complete', { workspaceId, companiesSynced, contactsSynced, errors });
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------
export function createHubspotWorker(connection: Redis): Worker {
  if (mongoose.connection.readyState === 0) {
    mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME }).catch((err) =>
      logger.error('hubspot.worker: Mongo connect error', { err })
    );
  }

  const worker = new Worker<HubSpotSyncPayload>(
    'hubspot-sync',
    async (job: Job<HubSpotSyncPayload>) => {
      await processHubspotSync(job);
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on('completed', (job) => logger.info('hubspot.worker: job completed', { jobId: job.id }));
  worker.on('failed', (job, err) =>
    logger.error('hubspot.worker: job failed', { jobId: job?.id, err })
  );

  return worker;
}
