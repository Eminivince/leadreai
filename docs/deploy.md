# Deploy Runbook

_Last updated: 2026-05-14 · Branch: `feature/production-readiness`._

This is the operational reference for getting LeadreAI from a green CI build to a live customer-serving deployment. It is deliberately mechanical — every section is "what you click / type" rather than "why we chose X."

The product spans three runnable units. Backend + workers ship as containers; frontend ships to Vercel.

---

## 1. Required infrastructure

| Service | Why we need it | Suggested provider |
|---|---|---|
| MongoDB replica set | Mongo transactions in `services/credits.ts` + `webhookIdempotency.ts` require a replica set. A standalone Mongo will throw at runtime on every grant/charge. | MongoDB Atlas (M10+) |
| Redis | BullMQ queues, rate-limit counters, daily send quota, magic-link cooldown. | Upstash / Elasticache / Redis Cloud |
| Cloudinary | File / evidence uploads, export hosting. | Cloudinary (free tier OK for v1) |
| Email outbound | Resend or SendGrid or per-workspace Gmail OAuth. | Resend recommended for transactional reliability |
| LLM | At least one of Anthropic / Google / OpenRouter / local. Boot fails fast if none configured (see `assertLlmConfigured` in `backend/src/index.ts`). | Anthropic Claude (primary), OpenRouter (fallback) |
| Stripe (optional) | Global payment provider. | stripe.com |
| Paystack (optional) | Nigeria/NGN payment provider. | paystack.com |

---

## 2. Required environment variables

The backend validates every env var via Zod at boot (`backend/src/config/env.ts`). Anything missing or malformed = `process.exit(1)` before listen.

**Mandatory:**

```
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://app.example.com

MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net
MONGODB_DB_NAME=leadreai
REDIS_URL=rediss://default:pass@host:6379

JWT_SECRET=<≥32 random bytes hex>
JWT_REFRESH_SECRET=<≥32 random bytes hex>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
BCRYPT_ROUNDS=12

# At least one LLM — boot fails if none set:
ANTHROPIC_API_KEY=<sk-ant-...>
# OR
GOOGLE_API_KEY=<...>
# OR
OPENROUTER_API_KEY=<sk-or-...>
```

**Conditionally mandatory (depending on enabled features):**

```
# Email — pick at least one per workspace's emailConfig.provider value
RESEND_API_KEY=<re_...>
RESEND_WEBHOOK_SECRET=<...>
SENDGRID_API_KEY=<SG....>
SENDGRID_WEBHOOK_SECRET=<...>

# Cloud storage
CLOUDINARY_URL=<cloudinary://...>

# Stripe (global billing)
STRIPE_SECRET_KEY=<sk_live_...>
STRIPE_WEBHOOK_SECRET=<whsec_...>
STRIPE_PRICE_ID_GROWTH=<price_...>

# Paystack (NG billing)
PAYSTACK_SECRET_KEY=<sk_live_...>
PAYSTACK_CURRENCY=ngn
PAYSTACK_NGN_RATE=1600  # USD→NGN multiplier
PAYSTACK_PLAN_CODE_GROWTH=<PLN_...>

# Google OAuth (sign-in + per-workspace Gmail sender)
GOOGLE_OAUTH_CLIENT_ID=<...apps.googleusercontent.com>
GOOGLE_OAUTH_CLIENT_SECRET=<...>

# SERP providers (cost-ordered registry; configure at least one)
SERPER_API_KEY=<...>
SERPAPI_KEY=<...>
BRAVE_API_KEY=<...>

# HubSpot (CRM sync)
HUBSPOT_CLIENT_ID=<...>
HUBSPOT_CLIENT_SECRET=<...>
```

Always reference `backend/src/config/env.ts` as source of truth — this list rots faster than the schema.

---

## 3. Backend container

Built from `Dockerfile.backend`. Runs as non-root (uid 1000 = node) with `HEALTHCHECK` against `/ready`.

```bash
docker build -f Dockerfile.backend -t leadreai-backend:$(git rev-parse --short HEAD) .
docker run --env-file .env.production -p 4000:4000 leadreai-backend:<tag>
```

**Verify:**

- `curl http://localhost:4000/health` → `{status:"ok",timestamp:...}` (liveness)
- `curl http://localhost:4000/ready` → `{status:"ready",checks:{mongo:"ok",redis:"ok"}}` (readiness, returns 503 if either dep is down)

**Orchestrator probes (Kubernetes example):**

```yaml
livenessProbe:
  httpGet: { path: /health, port: 4000 }
  initialDelaySeconds: 30
  periodSeconds: 30
readinessProbe:
  httpGet: { path: /ready, port: 4000 }
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
```

---

## 4. Workers container

Built from `Dockerfile.workers`. Includes Chromium for Playwright scraping. Runs as non-root.

```bash
docker build -f Dockerfile.workers -t leadreai-workers:$(git rev-parse --short HEAD) .
docker run --env-file .env.production leadreai-workers:<tag>
```

Workers don't expose an HTTP port — orchestrator monitors via exit code. Our `uncaughtException` / `unhandledRejection` handlers `process.exit(1)` on failure so the orchestrator restarts.

---

## 5. Frontend — Vercel

The frontend (`frontend/`) is Next.js 14 App Router and is currently Vercel-bound (no `output: 'standalone'` in `next.config.mjs`).

**One-time setup:**

1. `vercel link` from `frontend/`
2. Set env vars in Vercel project settings:
   - `NEXT_PUBLIC_API_URL=https://api.example.com`
   - any other `NEXT_PUBLIC_*` keys
3. Wire Vercel deploys to push on the `staging` and `main` branches.

**Deploy:**

```bash
cd frontend && vercel --prod
```

---

## 6. Database considerations

- **Indexes**: Mongoose `autoIndex: true` builds on first connection. The largest collections (`Lead`, `EmailEvent`, `CostEvent`, `CreditTransaction`, `WebhookEvent`) all have indexes declared in the model files. First production deploy will show a 30-60s latency spike while indexes build — acceptable but plan for it.
- **TTL indexes**: `WebhookEvent` (90 days), `AuditLog` (90 days), `EmailEvent.occurredAt` (90 days). These expire automatically; no GC job needed.
- **Replica set**: Mandatory. Transactions in `services/credits.ts` require it. Atlas default M10 has a 3-node replica set.

---

## 7. Pre-launch checklist

- [ ] Atlas replica set provisioned, connection string in env
- [ ] Redis URL in env (with TLS)
- [ ] Cloudinary URL in env
- [ ] At least one LLM key in env
- [ ] At least one email provider configured + webhook secret
- [ ] Stripe webhook endpoint configured at https://api.example.com/webhooks/stripe (raw body preserved by app.ts:51-56)
- [ ] Paystack webhook endpoint configured at https://api.example.com/webhooks/paystack
- [ ] Google OAuth redirect URI registered: https://api.example.com/api/v1/oauth/gmail/callback + /api/v1/auth/google/callback
- [ ] Vercel project linked + env vars set
- [ ] DNS records pointing to backend container + Vercel frontend
- [ ] TLS certs (LetsEncrypt / cloud-provider) in place
- [ ] `pnpm -r run type-check && pnpm -r run lint && pnpm -r run build` green on the deploy branch
- [ ] First container deploy + `/ready` returns 200
- [ ] Smoke test the goal.md §3 core loop end-to-end on the deployed env

---

## 8. On-call playbook

**"Jobs aren't running":**
1. Check workers container is up + recent logs.
2. Check Redis is reachable from workers (`docker exec leadreai-workers redis-cli -u $REDIS_URL ping`).
3. `GET /admin/queues` for queue depth (requires admin auth — see `admin.routes.ts`).
4. Check a recent `ProspectingJob` in Mongo — `status` field tells you which stage stalled.

**"Webhook is failing":**
1. `db.webhookevents.find({status: 'failed'}).sort({createdAt: -1}).limit(5)` shows the last 5 failures with error message.
2. A failed webhook can be re-driven by re-sending from the provider dashboard — `processWebhookOnce` resets `failed` → `processing` and retries the handler.

**"User says their balance is wrong":**
1. `db.credittransactions.find({userId: ObjectId("...")}).sort({createdAt: -1})` is the canonical ledger.
2. Balance fields on `User` are denormalised — every change has a matching ledger row by transaction invariant (`services/credits.ts`).
3. If balance and ledger disagree → file an incident; this should never happen given the transactional writes.

**"User says they can't log in / session keeps dropping":**
1. Check `User.tokenVersion`. A high value means logout has been bumping it — possibly normal.
2. Check JWT secret hasn't rotated unintentionally (would invalidate all sessions).
3. Browser DevTools → Network → /api/v1/auth/refresh response. If 401 with `Session expired`, the cookie `tv` is stale relative to the DB.

---

## 9. Rollback

- Each deploy tags the container with `git rev-parse --short HEAD`. Roll back by pointing the orchestrator at the previous tag.
- Vercel keeps automatic preview deployments per commit — promote any prior preview to production with one click.
- DB schema changes are additive only on this branch (`tokenVersion`, `WebhookEvent`, new credit reasons). Rolling back code does NOT require rolling back schema.
