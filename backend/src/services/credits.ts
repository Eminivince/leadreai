import mongoose from 'mongoose';
import User from '../models/User.js';
import CreditTransaction, {
  type CreditTransactionReason,
} from '../models/CreditTransaction.js';
import type { CreditBucket, PlanTier } from '@leadreai/shared';
import { planConfig } from '@leadreai/shared';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const MONTHLY_FIELD = 'monthlyCreditsBalance';
const TOPUP_FIELD = 'creditsBalance';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

interface LedgerNote {
  userId: string | mongoose.Types.ObjectId;
  workspaceId?: string | mongoose.Types.ObjectId;
  reason: CreditTransactionReason;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface ChargeInput extends LedgerNote {
  amount: number;
}

interface GrantInput extends ChargeInput {
  bucket: CreditBucket;
}

interface LedgerEntry {
  transactionId: string;
  bucket: CreditBucket;
  delta: number;
  balanceAfter: number;
}

interface ChargeResult {
  totalAfter: number;
  monthlyAfter: number;
  topupAfter: number;
  entries: LedgerEntry[];
}

interface GrantResult {
  balanceAfter: number;
  transactionId: string;
  bucket: CreditBucket;
}

function fieldFor(bucket: CreditBucket): typeof MONTHLY_FIELD | typeof TOPUP_FIELD {
  return bucket === 'monthly' ? MONTHLY_FIELD : TOPUP_FIELD;
}

async function writeLedger(
  base: LedgerNote,
  bucket: CreditBucket,
  kind: 'debit' | 'credit',
  delta: number,
  balanceAfter: number,
): Promise<string> {
  try {
    const txn = await CreditTransaction.create({
      userId: base.userId,
      workspaceId: base.workspaceId,
      kind,
      reason: base.reason,
      bucket,
      delta,
      balanceAfter,
      description: base.description,
      metadata: base.metadata,
    });
    return String(txn._id);
  } catch (err) {
    logger.warn('[credits] ledger write failed (balance already moved)', {
      userId: String(base.userId),
      reason: base.reason,
      bucket,
      err: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

/**
 * Charge a user's combined credit balance.
 *
 * Consumption order: monthly first (subscription allowance — use it or
 * lose it), then top-up. A charge that spans both buckets emits two
 * ledger rows so the split is visible.
 *
 * Each bucket deduct is an atomic `findOneAndUpdate` with `$gte` guard,
 * so concurrent dispatches can't both succeed when the combined balance
 * is below the required amount. If the monthly bucket doesn't cover it,
 * we pay out what's there and keep going on the top-up bucket. If neither
 * does, we throw — no half-charges leave the system.
 */
export async function chargeCredits(input: ChargeInput): Promise<ChargeResult> {
  if (input.amount < 0) {
    throw new Error('chargeCredits amount must be non-negative');
  }

  const user = await User.findById(input.userId).select(`${MONTHLY_FIELD} ${TOPUP_FIELD}`);
  if (!user) throw ApiError.notFound('User not found');

  if (input.amount === 0) {
    return {
      totalAfter: user.monthlyCreditsBalance + user.creditsBalance,
      monthlyAfter: user.monthlyCreditsBalance,
      topupAfter: user.creditsBalance,
      entries: [],
    };
  }

  const combined = user.monthlyCreditsBalance + user.creditsBalance;
  if (combined < input.amount) {
    throw ApiError.badRequest(
      `Insufficient credits. This action requires ${input.amount} credit${
        input.amount === 1 ? '' : 's'
      }. You have ${combined}.`,
    );
  }

  const fromMonthly = Math.min(input.amount, user.monthlyCreditsBalance);
  const fromTopup = input.amount - fromMonthly;
  const entries: LedgerEntry[] = [];

  let monthlyAfter = user.monthlyCreditsBalance;
  let topupAfter = user.creditsBalance;

  if (fromMonthly > 0) {
    const updated = await User.findOneAndUpdate(
      { _id: input.userId, [MONTHLY_FIELD]: { $gte: fromMonthly } },
      { $inc: { [MONTHLY_FIELD]: -fromMonthly } },
      { new: true, projection: { [MONTHLY_FIELD]: 1 } },
    );
    if (!updated) {
      // Monthly shrank between read and write (concurrent charge). Abort —
      // no partial state; caller can retry and we'll rebalance.
      throw ApiError.badRequest('Credit balance changed during charge; please retry.');
    }
    monthlyAfter = updated.monthlyCreditsBalance;
    const txnId = await writeLedger(input, 'monthly', 'debit', -fromMonthly, monthlyAfter);
    entries.push({
      transactionId: txnId,
      bucket: 'monthly',
      delta: -fromMonthly,
      balanceAfter: monthlyAfter,
    });
  }

  if (fromTopup > 0) {
    const updated = await User.findOneAndUpdate(
      { _id: input.userId, [TOPUP_FIELD]: { $gte: fromTopup } },
      { $inc: { [TOPUP_FIELD]: -fromTopup } },
      { new: true, projection: { [TOPUP_FIELD]: 1 } },
    );
    if (!updated) {
      // Top-up shrank mid-charge. Refund the monthly portion we already took
      // so the user isn't stranded with a half-charge.
      if (fromMonthly > 0) {
        await User.updateOne(
          { _id: input.userId },
          { $inc: { [MONTHLY_FIELD]: fromMonthly } },
        ).catch(() => {});
      }
      throw ApiError.badRequest('Credit balance changed during charge; please retry.');
    }
    topupAfter = updated.creditsBalance;
    const txnId = await writeLedger(input, 'topup', 'debit', -fromTopup, topupAfter);
    entries.push({
      transactionId: txnId,
      bucket: 'topup',
      delta: -fromTopup,
      balanceAfter: topupAfter,
    });
  }

  return {
    totalAfter: monthlyAfter + topupAfter,
    monthlyAfter,
    topupAfter,
    entries,
  };
}

/**
 * Credit a specific bucket. Used for refunds, top-ups, and subscription
 * renewals. The caller decides which wallet to fund.
 */
export async function grantCredits(input: GrantInput): Promise<GrantResult> {
  if (input.amount <= 0) {
    throw new Error('grantCredits amount must be positive');
  }

  const field = fieldFor(input.bucket);
  const updated = await User.findByIdAndUpdate(
    input.userId,
    { $inc: { [field]: input.amount } },
    { new: true, projection: { [field]: 1 } },
  );
  if (!updated) throw ApiError.notFound('User not found');

  const balanceAfter =
    input.bucket === 'monthly' ? updated.monthlyCreditsBalance : updated.creditsBalance;
  const transactionId = await writeLedger(
    input,
    input.bucket,
    'credit',
    input.amount,
    balanceAfter,
  );

  return { balanceAfter, transactionId, bucket: input.bucket };
}

/**
 * If the user's subscription is due for renewal, top the monthly bucket
 * back up to `plan.monthlyCredits` and advance `subscriptionRenewsAt`.
 *
 * Important: unused monthly credits do NOT carry over. Renewal resets
 * the bucket to the allowance, regardless of remaining balance. This is
 * the "use it or lose it" rule; it's why the bucket is split from top-up
 * in the first place.
 *
 * Called lazily on credits reads and before charges — cheaper than a cron
 * for a small user base, and avoids a window where a renewal is "due"
 * but hasn't run yet.
 */
export async function renewSubscriptionIfDue(
  userId: string | mongoose.Types.ObjectId,
): Promise<{ renewed: boolean; monthlyAfter: number; renewsAt?: Date }> {
  const user = await User.findById(userId).select(
    'plan monthlyCreditsBalance subscriptionRenewsAt',
  );
  if (!user) throw ApiError.notFound('User not found');

  const now = new Date();
  const dueAt = user.subscriptionRenewsAt;

  // If there's no renewal timestamp yet (new user, or plan never set),
  // seed one now so the next read has a deadline to compare against.
  if (!dueAt) {
    const plan = planConfig(user.plan as PlanTier);
    const next = new Date(now.getTime() + MONTH_MS);
    // Atomic upgrade: set the monthly balance up to the allowance only
    // if it's less, never clobbering a higher manual grant.
    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $max: { monthlyCreditsBalance: plan.monthlyCredits },
        $set: { subscriptionRenewsAt: next },
      },
      { new: true, projection: { monthlyCreditsBalance: 1, subscriptionRenewsAt: 1 } },
    );
    if (!updated) throw ApiError.notFound('User not found');
    if (plan.monthlyCredits > 0) {
      await writeLedger(
        {
          userId,
          reason: 'subscription.renewal',
          description: `Seeded ${plan.label} allowance (${plan.monthlyCredits}/mo)`,
        },
        'monthly',
        'credit',
        plan.monthlyCredits,
        updated.monthlyCreditsBalance,
      ).catch(() => {});
    }
    return {
      renewed: true,
      monthlyAfter: updated.monthlyCreditsBalance,
      renewsAt: updated.subscriptionRenewsAt,
    };
  }

  if (now < dueAt) {
    return { renewed: false, monthlyAfter: user.monthlyCreditsBalance, renewsAt: dueAt };
  }

  // Renewal due. Reset monthly bucket to allowance (not $inc — this is
  // use-it-or-lose-it) and advance the renewsAt.
  const plan = planConfig(user.plan as PlanTier);
  const next = new Date(now.getTime() + MONTH_MS);
  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        [MONTHLY_FIELD]: plan.monthlyCredits,
        subscriptionRenewsAt: next,
      },
    },
    { new: true, projection: { monthlyCreditsBalance: 1, subscriptionRenewsAt: 1 } },
  );
  if (!updated) throw ApiError.notFound('User not found');

  if (plan.monthlyCredits > 0) {
    await writeLedger(
      {
        userId,
        reason: 'subscription.renewal',
        description: `Monthly renewal — ${plan.label} (${plan.monthlyCredits}/mo)`,
      },
      'monthly',
      'credit',
      plan.monthlyCredits,
      updated.monthlyCreditsBalance,
    ).catch(() => {});
  }

  return {
    renewed: true,
    monthlyAfter: updated.monthlyCreditsBalance,
    renewsAt: updated.subscriptionRenewsAt,
  };
}

/**
 * Switch a user's plan, reset the monthly allowance to the new tier's
 * quota, and start a fresh 30-day renewal cycle. Used by the dev
 * subscribe endpoint today and by Stripe's webhook later.
 */
export async function subscribeToPlan(
  userId: string | mongoose.Types.ObjectId,
  plan: PlanTier,
): Promise<{ monthlyAfter: number; renewsAt: Date }> {
  const cfg = planConfig(plan);
  const now = new Date();
  const next = new Date(now.getTime() + MONTH_MS);

  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        plan,
        [MONTHLY_FIELD]: cfg.monthlyCredits,
        subscriptionRenewsAt: next,
        planExpiresAt: cfg.priceUsd === 0 ? undefined : next,
      },
    },
    { new: true, projection: { monthlyCreditsBalance: 1, subscriptionRenewsAt: 1 } },
  );
  if (!updated) throw ApiError.notFound('User not found');

  await writeLedger(
    {
      userId,
      reason: 'subscription.change',
      description: `Subscribed to ${cfg.label} — ${cfg.monthlyCredits}/mo`,
      metadata: { plan, monthlyCredits: cfg.monthlyCredits },
    },
    'monthly',
    'credit',
    cfg.monthlyCredits,
    updated.monthlyCreditsBalance,
  ).catch(() => {});

  return { monthlyAfter: updated.monthlyCreditsBalance, renewsAt: next };
}
