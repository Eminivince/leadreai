# Assumptions

## Phase 1

- `pnpm@9` and `node@20+` are installed on the dev machine
- MongoDB Atlas URI and Redis URL are placed in `backend/.env` (gitignored)
- Frontend JWT auth stores accessToken in memory (React state) and refreshToken in httpOnly cookie
- `next-auth` is NOT used; auth is fully custom backend JWT
- Turborepo `dev` task runs backend + frontend + workers in parallel
- Workers package runs idle in Phase 1 — verifies BullMQ connects to Redis but processes no jobs
