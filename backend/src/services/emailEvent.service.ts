import mongoose from 'mongoose';
import EmailEvent from '../models/EmailEvent.js';
import SequenceEnrollment, { type ISequenceEnrollmentDoc } from '../models/SequenceEnrollment.js';
import Sequence from '../models/Sequence.js';
import Lead from '../models/Lead.js';
import { SuppressionEntry } from '../models/SuppressionList.js';
import { logger } from '../utils/logger.js';

interface NormalizedEvent {
  workspaceId?: string;
  messageId: string;
  event: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'replied' | 'unsubscribed';
  provider: 'resend' | 'sendgrid';
  bounceType?: 'hard' | 'soft';
  occurredAt: Date;
  raw: Record<string, unknown>;
  recipientEmail?: string;
}

function normalizeResend(payload: Record<string, unknown>): NormalizedEvent | null {
  const type = payload['type'] as string | undefined;
  const data = payload['data'] as Record<string, unknown> | undefined;
  if (!data) return null;

  const emailId = data['email_id'] as string | undefined;
  const to = (data['to'] as string[] | undefined)?.[0];

  const eventMap: Record<string, NormalizedEvent['event']> = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
  };

  const event = type ? eventMap[type] : undefined;
  if (!event || !emailId) return null;

  const isSoftBounce = typeof data['bounce_type'] === 'string' && (data['bounce_type'] as string).toLowerCase() === 'soft';

  return {
    messageId: emailId,
    event,
    provider: 'resend',
    bounceType: event === 'bounced' ? (isSoftBounce ? 'soft' : 'hard') : undefined,
    occurredAt: new Date((data['created_at'] as string | undefined) ?? Date.now()),
    raw: payload,
    recipientEmail: to,
  };
}

function normalizeSendGrid(payload: Record<string, unknown>): NormalizedEvent | null {
  const sgEvent = payload['event'] as string | undefined;
  const messageId = (payload['smtp-id'] as string | undefined) ?? (payload['sg_message_id'] as string | undefined);
  if (!sgEvent || !messageId) return null;

  const eventMap: Record<string, NormalizedEvent['event']> = {
    delivered: 'delivered',
    open: 'opened',
    click: 'clicked',
    bounce: 'bounced',
    spamreport: 'complained',
    unsubscribe: 'unsubscribed',
  };
  const event = eventMap[sgEvent];
  if (!event) return null;

  const type = payload['type'] as string | undefined;
  return {
    messageId: messageId.split('.')[0] ?? messageId,
    event,
    provider: 'sendgrid',
    bounceType: event === 'bounced' ? (type === 'bounce' ? 'hard' : 'soft') : undefined,
    occurredAt: new Date((payload['timestamp'] as number | undefined ?? Date.now()) * 1000),
    raw: payload,
    recipientEmail: payload['email'] as string | undefined,
  };
}

async function applyStopRules(
  enrollment: ISequenceEnrollmentDoc,
  event: NormalizedEvent['event'],
): Promise<boolean> {
  if (!enrollment) return false;
  const sequence = await Sequence.findById(enrollment.sequenceId).select('stopRules stats');
  if (!sequence) return false;

  for (const rule of sequence.stopRules) {
    const triggered =
      (rule.trigger === 'any_reply' && event === 'replied') ||
      (rule.trigger === 'unsubscribe' && event === 'unsubscribed') ||
      (rule.trigger === 'bounce' && event === 'bounced');

    if (triggered && rule.action === 'stop_sequence') {
      await SequenceEnrollment.updateOne(
        { _id: enrollment._id },
        { $set: { status: 'stopped', stopReason: rule.trigger, completedAt: new Date() } },
      );
      await Sequence.updateOne({ _id: sequence._id }, { $inc: { 'stats.active': -1 } });
      return true;
    }
  }
  return false;
}

export async function processEmailEvent(
  provider: 'resend' | 'sendgrid',
  rawPayload: Record<string, unknown>,
): Promise<void> {
  const normalized = provider === 'resend'
    ? normalizeResend(rawPayload)
    : normalizeSendGrid(rawPayload);

  if (!normalized) {
    logger.warn('[emailEvent] Could not normalize event', { provider, type: rawPayload['type'] ?? rawPayload['event'] });
    return;
  }

  // Find enrollment by messageId in step history
  const enrollment = await SequenceEnrollment.findOne({
    'stepHistory.messageId': normalized.messageId,
  });

  // Save event record
  await EmailEvent.create({
    workspaceId: enrollment?.workspaceId,
    enrollmentId: enrollment?._id,
    messageId: normalized.messageId,
    event: normalized.event,
    provider: normalized.provider,
    bounceType: normalized.bounceType,
    raw: normalized.raw,
    occurredAt: normalized.occurredAt,
  });

  if (!enrollment) {
    logger.info('[emailEvent] No enrollment found for messageId', { messageId: normalized.messageId });
    return;
  }

  const stepIndex = enrollment.stepHistory.findIndex(s => s.messageId === normalized.messageId);
  const historyUpdate: Record<string, unknown> = {};

  switch (normalized.event) {
    case 'delivered':
      historyUpdate[`stepHistory.${stepIndex}.deliveredAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'delivered';
      break;
    case 'opened':
      historyUpdate[`stepHistory.${stepIndex}.openedAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'opened';
      break;
    case 'clicked':
      historyUpdate[`stepHistory.${stepIndex}.clickedAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'clicked';
      break;
    case 'replied':
      historyUpdate[`stepHistory.${stepIndex}.repliedAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'replied';
      await SequenceEnrollment.updateOne({ _id: enrollment._id }, { $set: { status: 'replied' } });
      await Sequence.updateOne(
        { _id: enrollment.sequenceId },
        { $inc: { 'stats.replied': 1, 'stats.active': -1 } },
      );
      await applyStopRules(enrollment, 'replied');
      break;
    case 'bounced': {
      historyUpdate[`stepHistory.${stepIndex}.bouncedAt`] = normalized.occurredAt;
      historyUpdate[`stepHistory.${stepIndex}.status`] = 'bounced';
      historyUpdate[`stepHistory.${stepIndex}.bounceType`] = normalized.bounceType;

      if (normalized.bounceType === 'hard') {
        // Hard bounce: suppress email + stop enrollment + update lead
        if (normalized.recipientEmail) {
          const workspaceId = enrollment.workspaceId.toString();
          await SuppressionEntry.updateOne(
            { workspaceId, email: normalized.recipientEmail.toLowerCase() },
            { $setOnInsert: { workspaceId, email: normalized.recipientEmail.toLowerCase(), reason: 'bounce', addedAt: new Date() } },
            { upsert: true },
          );
          await Lead.updateOne(
            { _id: enrollment.leadId },
            { $set: { outreachStatus: 'bounced', suppressedAt: new Date(), suppressReason: 'hard_bounce' } },
          );
        }
        await SequenceEnrollment.updateOne(
          { _id: enrollment._id },
          { $set: { status: 'bounced', stopReason: 'hard_bounce', completedAt: new Date() } },
        );
        await Sequence.updateOne(
          { _id: enrollment.sequenceId },
          { $inc: { 'stats.bounced': 1, 'stats.active': -1 } },
        );
      }
      break;
    }
    case 'complained':
      // Treat like hard bounce
      if (normalized.recipientEmail) {
        const workspaceId = enrollment.workspaceId.toString();
        await SuppressionEntry.updateOne(
          { workspaceId, email: normalized.recipientEmail.toLowerCase() },
          { $setOnInsert: { workspaceId, email: normalized.recipientEmail.toLowerCase(), reason: 'bounce', addedAt: new Date() } },
          { upsert: true },
        );
        await Lead.updateOne({ _id: enrollment.leadId }, { $set: { outreachStatus: 'bounced', suppressedAt: new Date(), suppressReason: 'spam_complaint' } });
      }
      await SequenceEnrollment.updateOne(
        { _id: enrollment._id },
        { $set: { status: 'stopped', stopReason: 'spam_complaint', completedAt: new Date() } },
      );
      await Sequence.updateOne({ _id: enrollment.sequenceId }, { $inc: { 'stats.active': -1 } });
      break;
    case 'unsubscribed':
      await SequenceEnrollment.updateOne(
        { _id: enrollment._id },
        { $set: { status: 'unsubscribed', stopReason: 'unsubscribe', completedAt: new Date() } },
      );
      await Sequence.updateOne(
        { _id: enrollment.sequenceId },
        { $inc: { 'stats.unsubscribed': 1, 'stats.active': -1 } },
      );
      break;
  }

  if (Object.keys(historyUpdate).length > 0 && stepIndex >= 0) {
    await SequenceEnrollment.updateOne({ _id: enrollment._id }, { $set: historyUpdate });
  }
}
