import Stripe from 'stripe';
import { env } from '../config/env.js';
import { CREDIT_PACKAGES, PLAN_CONFIG } from '@leadreai/shared';
import User from '../models/User.js';
import { grantCredits, subscribeToPlan } from './credits.js';

function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' });
}

// Get or create a Stripe Customer for a user
export async function ensureStripeCustomer(userId: string, email: string): Promise<string> {
  const user = await User.findById(userId).select('stripeCustomerId');
  if (!user) throw new Error('User not found');
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({ email, metadata: { userId } });
  await User.findByIdAndUpdate(userId, { stripeCustomerId: customer.id });
  return customer.id;
}

// Subscription checkout session (recurring)
export async function createStripeSubscribeSession(
  userId: string,
  email: string,
  planId: string,
): Promise<string> {
  if (!env.STRIPE_PRICE_ID_GROWTH) throw new Error('STRIPE_PRICE_ID_GROWTH not configured');
  if (planId !== 'growth') throw new Error('Only growth plan supports Stripe subscription');

  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(userId, email);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: env.STRIPE_PRICE_ID_GROWTH, quantity: 1 }],
    metadata: { userId, planId },
    success_url: `${env.FRONTEND_URL}/dashboard/settings/billing?stripe=subscribed`,
    cancel_url: `${env.FRONTEND_URL}/dashboard/settings/billing?stripe=cancelled`,
  });

  await User.findByIdAndUpdate(userId, { billingProvider: 'stripe' });
  return session.url!;
}

// One-time top-up checkout session
export async function createStripeTopUpSession(
  userId: string,
  email: string,
  packageId: string,
): Promise<string> {
  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) throw new Error(`Unknown package: ${packageId}`);

  // Validate plan config is accessible (unused but ensures shared import works)
  void PLAN_CONFIG;

  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(userId, email);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(pkg.priceUsd * 100),
          product_data: {
            name: `${pkg.label} — LeadreAI credits`,
            description: pkg.tagline,
          },
        },
      },
    ],
    metadata: { userId, packageId, type: 'topup' },
    success_url: `${env.FRONTEND_URL}/dashboard/settings/billing?stripe=topped_up`,
    cancel_url: `${env.FRONTEND_URL}/dashboard/settings/billing?stripe=cancelled`,
  });

  await User.findByIdAndUpdate(userId, { billingProvider: 'stripe' });
  return session.url!;
}

// Webhook handler — call with req.rawBody and the stripe-signature header
export async function handleStripeWebhook(rawBody: Buffer, sig: string): Promise<void> {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  const stripe = getStripe();

  const event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (!userId) return;

    if (session.mode === 'subscription') {
      const planId = (session.metadata?.planId ?? 'growth') as 'free' | 'growth' | 'enterprise';
      await subscribeToPlan(userId, planId);
      if (session.subscription) {
        await User.findByIdAndUpdate(userId, {
          stripeSubscriptionId: String(session.subscription),
          billingProvider: 'stripe',
        });
      }
    } else if (session.mode === 'payment' && session.metadata?.type === 'topup') {
      const pkg = CREDIT_PACKAGES.find((p) => p.id === session.metadata?.packageId);
      if (pkg) {
        await grantCredits({
          userId,
          amount: pkg.credits,
          bucket: 'topup',
          reason: 'topup.stripe',
          description: `Stripe top-up — ${pkg.label}`,
          metadata: { packageId: pkg.id, priceUsd: pkg.priceUsd, sessionId: session.id },
        });
      }
    }
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice;
    // Recurring subscription renewal — refresh monthly credits
    const customerId =
      typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;
    const user = await User.findOne({ stripeCustomerId: customerId }).select('_id plan');
    if (!user) return;
    // Re-subscribe to current plan (resets monthly bucket and advances renewsAt)
    await subscribeToPlan(String(user._id), user.plan as 'free' | 'growth' | 'enterprise');
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (!customerId) return;
    const user = await User.findOne({ stripeCustomerId: customerId }).select('_id');
    if (user) await subscribeToPlan(String(user._id), 'free');
  }
}
