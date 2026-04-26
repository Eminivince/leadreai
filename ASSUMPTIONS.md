# Assumptions

## Phase 1

- `pnpm@9` and `node@20+` are installed on the dev machine
- MongoDB Atlas URI and Redis URL are placed in `backend/.env` (gitignored)
- Frontend JWT auth stores accessToken in memory (React state) and refreshToken in httpOnly cookie
- `next-auth` is NOT used; auth is fully custom backend JWT
- Turborepo `dev` task runs backend + frontend + workers in parallel
- Workers package runs idle in Phase 1 — verifies BullMQ connects to Redis but processes no jobs
- ESLint 8 is used instead of ESLint 9 — the .eslintrc.cjs format is more compatible with the @typescript-eslint plugin versions installed
- File storage uses Cloudinary (not S3/R2) — exports upload to Cloudinary and return a signed URL
- Dual AI provider: `USE_GOOGLE=false` (default) routes to Anthropic Claude; `USE_GOOGLE=true` routes to Google Gemini. Both SDKs are installed but loaded lazily — only the active one is imported at runtime. Prompt caching (`cacheSystem: true`) is supported on Anthropic only and silently ignored on Google.
