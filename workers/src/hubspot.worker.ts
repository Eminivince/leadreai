import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { createDecipheriv, scryptSync } from 'crypto';
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
  const accessToken = decrypt(hs.accessToken as string);

  // 3. Load leads
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
      // 4. Upsert company
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

      // 5. Load contacts for this lead
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

  // 6. Write sync log entry
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
