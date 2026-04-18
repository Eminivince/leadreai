import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { Schema } from 'mongoose';
import { createHmac, scryptSync, createDecipheriv } from 'crypto';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import { renderTemplate } from './services/templateRenderer.js';
import { isWithinSendWindow, nextSendTime, type SendWindow } from './services/sendWindowChecker.js';

export interface SequenceStepPayload {
  enrollmentId: string;
  stepNumber: number;
}

const QUEUE_PREFIX = `{bull}:leadreai:${env.NODE_ENV}`;

// ─── Inline decrypt (mirrors backend/src/utils/encrypt.ts) ───────────────────
function decryptValue(ciphertext: string): string {
  const key = scryptSync(env.JWT_SECRET, 'leadreai-salt', 32);
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ─── Inline unsubscribe token generation ─────────────────────────────────────
function buildUnsubscribeUrl(workspaceId: string, email: string): string {
  const secret = env.UNSUBSCRIBE_TOKEN_SECRET ?? env.JWT_SECRET;
  const token = jwt.sign({ wid: workspaceId, email: email.toLowerCase() }, secret, { expiresIn: '30d' });
  return `${env.UNSUBSCRIBE_BASE_URL}?t=${token}`;
}

// ─── Inline Mongoose models (minimal field sets) ──────────────────────────────

// Workspace — only emailConfig needed
const workspaceSchema = new Schema({
  emailConfig: {
    provider: String,
    fromEmail: String,
    fromName: String,
    replyTo: String,
    apiKey: { type: String, select: false },
    smtpHost: String,
    smtpPort: Number,
    smtpSecure: Boolean,
    smtpUser: String,
    smtpPass: { type: String, select: false },
  },
}, { strict: false });

const WorkspaceModel = mongoose.models['WS_SEQ'] as mongoose.Model<any> ??
  mongoose.model('WS_SEQ', workspaceSchema, 'workspaces');

// Lead — companyName, industry, address, website, companyDomain, emails
const leadSchema = new Schema({
  companyName: String,
  companyDomain: String,
  industry: String,
  website: String,
  address: { city: String, country: String },
  emails: [{ address: String, type: String }],
}, { strict: false });

const LeadModel = mongoose.models['LEAD_SEQ'] as mongoose.Model<any> ??
  mongoose.model('LEAD_SEQ', leadSchema, 'leads');

// Contact — firstName, lastName, fullName, title
const contactSchema = new Schema({
  firstName: String,
  lastName: String,
  fullName: String,
  title: String,
}, { strict: false });

const ContactModel = mongoose.models['CONTACT_SEQ'] as mongoose.Model<any> ??
  mongoose.model('CONTACT_SEQ', contactSchema, 'contacts');

// SequenceEnrollment — full shape needed for state machine updates
const enrollmentSchema = new Schema({
  workspaceId: Schema.Types.ObjectId,
  sequenceId: Schema.Types.ObjectId,
  leadId: Schema.Types.ObjectId,
  contactId: Schema.Types.ObjectId,
  status: String,
  currentStep: Number,
  nextStepAt: Date,
  completedAt: Date,
  stopReason: String,
  stepHistory: [{
    stepNumber: Number,
    sentAt: Date,
    status: String,
    messageId: String,
    errorMessage: String,
    toEmail: String,
    _id: false,
  }],
}, { strict: false, timestamps: true });

const EnrollmentModel = mongoose.models['ENROLLMENT_SEQ'] as mongoose.Model<any> ??
  mongoose.model('ENROLLMENT_SEQ', enrollmentSchema, 'sequenceenrollments');

// Sequence — steps and stopRules
const sequenceSchema = new Schema({
  workspaceId: Schema.Types.ObjectId,
  status: String,
  steps: [{ stepNumber: Number, channel: String, delayDays: Number, sendWindow: Schema.Types.Mixed, emailTemplate: Schema.Types.Mixed, _id: false }],
  stopRules: [{ trigger: String, action: String, _id: false }],
}, { strict: false });

const SequenceModel = mongoose.models['SEQ_MODEL'] as mongoose.Model<any> ??
  mongoose.model('SEQ_MODEL', sequenceSchema, 'sequences');

// SuppressionEntry — email + domain
const suppressionSchema = new Schema({ workspaceId: Schema.Types.ObjectId, email: String, domain: String }, { strict: false });
const SuppressionModel = mongoose.models['SUPPRESSION_SEQ'] as mongoose.Model<any> ??
  mongoose.model('SUPPRESSION_SEQ', suppressionSchema, 'suppressionentries');

// ─── Email send helper ────────────────────────────────────────────────────────
async function sendEmail(
  emailConfig: Record<string, any>,
  to: string,
  subject: string,
  body: string,
  unsubscribeUrl: string,
): Promise<string> {
  const footerHtml = `<br><br><hr style="border:none;border-top:1px solid #eee;margin:24px 0"><p style="font-size:11px;color:#999;font-family:sans-serif">To unsubscribe: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></p>`;
  const footerText = `\n\n---\nTo unsubscribe: ${unsubscribeUrl}`;
  const htmlBody = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>${footerHtml}`;
  const textBody = body + footerText;
  const headers = { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };

  if (emailConfig.provider === 'resend') {
    const apiKey = decryptValue(emailConfig.apiKey);
    const resend = new Resend(apiKey);
    const from = `${emailConfig.fromName as string} <${emailConfig.fromEmail as string}>`;
    const { data, error } = await resend.emails.send({ from, to, subject, html: htmlBody, text: textBody, headers });
    if (error || !data) throw new Error(error?.message ?? 'Resend send failed');
    return data.id;
  }

  const smtpConfig =
    emailConfig.provider === 'sendgrid'
      ? { host: 'smtp.sendgrid.net', port: 587, auth: { user: 'apikey', pass: decryptValue(emailConfig.apiKey) } }
      : {
          host: emailConfig.smtpHost as string,
          port: (emailConfig.smtpPort as number) ?? 587,
          secure: (emailConfig.smtpSecure as boolean) ?? false,
          auth: emailConfig.smtpUser ? { user: emailConfig.smtpUser as string, pass: decryptValue(emailConfig.smtpPass) } : undefined,
        };

  const transporter = nodemailer.createTransport(smtpConfig);
  const info = await transporter.sendMail({
    from: `"${emailConfig.fromName as string}" <${emailConfig.fromEmail as string}>`,
    to,
    subject,
    html: htmlBody,
    text: textBody,
    headers,
  });
  return String(info.messageId);
}

// ─── Main job processor ───────────────────────────────────────────────────────
async function processSequenceStep(job: Job<SequenceStepPayload>): Promise<void> {
  const { enrollmentId, stepNumber } = job.data;
  const tag = `[sequence.worker:${enrollmentId}:step${stepNumber}]`;

  const enrollment = await EnrollmentModel.findById(enrollmentId);
  if (!enrollment) { logger.warn(`${tag} enrollment not found`); return; }
  if (enrollment.status !== 'active') { logger.info(`${tag} enrollment not active (${String(enrollment.status)}), skipping`); return; }
  if (enrollment.currentStep !== stepNumber) { logger.info(`${tag} step mismatch (current=${String(enrollment.currentStep)})`); return; }

  const sequence = await SequenceModel.findById(enrollment.sequenceId);
  if (!sequence || sequence.status === 'archived') { logger.warn(`${tag} sequence not found or archived`); return; }

  const step = (sequence.steps as any[]).find((s: any) => s.stepNumber === stepNumber);
  if (!step) { logger.warn(`${tag} step definition not found`); return; }

  // Only email steps supported in this implementation
  if (step.channel !== 'email' || !step.emailTemplate) {
    logger.info(`${tag} non-email step or no template, marking completed`);
    await advanceOrComplete(enrollment, sequence, step, null, null);
    return;
  }

  const lead = await LeadModel.findById(enrollment.leadId);
  if (!lead) { logger.warn(`${tag} lead not found`); return; }

  const toEmail = (lead.emails as any[])[0]?.address as string | undefined;
  if (!toEmail) { logger.warn(`${tag} lead has no email`); return; }

  // Check suppression
  const domain = toEmail.split('@')[1] ?? '';
  const suppressed = await SuppressionModel.findOne({
    workspaceId: enrollment.workspaceId,
    $or: [{ email: toEmail.toLowerCase() }, { domain }],
  });
  if (suppressed) {
    logger.info(`${tag} email suppressed, skipping step`);
    const histEntry = { stepNumber, status: 'skipped', toEmail };
    await EnrollmentModel.updateOne({ _id: enrollmentId }, { $push: { stepHistory: histEntry } });
    await advanceOrComplete(enrollment, sequence, step, null, null);
    return;
  }

  // Check send window
  if (step.sendWindow) {
    const sw = step.sendWindow as SendWindow;
    if (!isWithinSendWindow(sw, new Date())) {
      const nextTime = nextSendTime(sw, new Date());
      logger.info(`${tag} outside send window, rescheduling to ${nextTime.toISOString()}`);
      await EnrollmentModel.updateOne({ _id: enrollmentId }, { $set: { nextStepAt: nextTime } });
      return; // Scheduler will re-dispatch
    }
  }

  // Load workspace for email config
  const workspace = await WorkspaceModel.findById(enrollment.workspaceId).select('+emailConfig.apiKey +emailConfig.smtpPass');
  if (!workspace?.emailConfig) {
    logger.error(`${tag} workspace has no email config`);
    return;
  }

  // Render template
  const contact = enrollment.contactId ? await ContactModel.findById(enrollment.contactId) : null;
  const subject = renderTemplate(step.emailTemplate.subject as string, lead, contact ?? undefined);
  const body = renderTemplate(step.emailTemplate.body as string, lead, contact ?? undefined);

  // Build unsubscribe URL
  const unsubscribeUrl = buildUnsubscribeUrl(enrollment.workspaceId.toString(), toEmail);

  // Send
  let messageId: string | null = null;
  let errorMessage: string | undefined;

  try {
    messageId = await sendEmail(workspace.emailConfig, toEmail, subject, body, unsubscribeUrl);
    logger.info(`${tag} sent successfully`, { messageId, to: toEmail });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`${tag} send failed`, { err });
  }

  // Record step history
  const histEntry = {
    stepNumber,
    sentAt: messageId ? new Date() : undefined,
    status: messageId ? 'sent' : 'failed',
    messageId: messageId ?? undefined,
    errorMessage,
    toEmail,
  };

  await EnrollmentModel.updateOne({ _id: enrollmentId }, { $push: { stepHistory: histEntry } });

  // Update lead outreachStatus to 'sent' on first successful send
  if (messageId && stepNumber === 1) {
    const LeadFullModel: mongoose.Model<any> = (mongoose.models['leads'] as mongoose.Model<any> | undefined) ??
      mongoose.model('leads', new Schema({}, { strict: false }), 'leads');
    await LeadFullModel.updateOne({ _id: enrollment.leadId }, { $set: { outreachStatus: 'sent' } });
  }

  if (messageId) {
    await advanceOrComplete(enrollment, sequence, step, new Date(), messageId);
  }
}

async function advanceOrComplete(
  enrollment: any,
  sequence: any,
  currentStep: any,
  sentAt: Date | null,
  messageId: string | null,
): Promise<void> {
  const steps = sequence.steps as any[];
  const nextStep = steps.find((s: any) => s.stepNumber === currentStep.stepNumber + 1);

  if (!nextStep) {
    await EnrollmentModel.updateOne(
      { _id: enrollment._id },
      { $set: { status: 'completed', completedAt: new Date() } },
    );
    return;
  }

  const base = sentAt ?? new Date();
  const nextStepAt = new Date(base.getTime() + nextStep.delayDays * 86_400_000);

  await EnrollmentModel.updateOne(
    { _id: enrollment._id },
    { $set: { currentStep: nextStep.stepNumber, nextStepAt } },
  );
}

// ─── Worker factory ───────────────────────────────────────────────────────────
export function createSequenceWorker(connection: Redis): Worker {
  if (mongoose.connection.readyState === 0) {
    mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME }).catch(err =>
      logger.error('Sequence worker Mongo connect error', { err }),
    );
  }

  const worker = new Worker<SequenceStepPayload>(
    'sequence-step',
    async (job) => { await processSequenceStep(job); },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
      prefix: QUEUE_PREFIX,
    },
  );

  worker.on('completed', (job) => logger.info('sequence.worker: job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('sequence.worker: job failed', { jobId: job?.id, err }));

  return worker;
}
