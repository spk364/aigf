# CLAUDE.md

## Before opening a PR

Run `pnpm verify` and open the PR only when it passes. It runs, in order:

1. `pnpm typecheck` — tsc
2. `pnpm lint` — next lint
3. `pnpm test` — unit tests (vitest, mocked payload, no DB)
4. `pnpm test:integration` — real Payload config against the database in
   `.env.local` (tests/integration)
5. `pnpm build` — the same `next build` Vercel runs, on the Node version pinned
   in `package.json` `engines`

Any change to a route, raw SQL, or anything that reaches into `payload.db`
needs an integration test. Unit tests mock `payload.db`, so they pass even when
the mock's shape is wrong. That is how "clear history" shipped a 500 and vector
memory never worked in prod (see `src/shared/db/sql-pool.ts`).

The `.env.local` database is the shared production Supabase database. Integration
tests must only touch rows they create themselves (owned by the seeded dev user
`dev@local.test`) and must delete them in `afterAll` through Payload's API.

## Gotchas

- Raw SQL: get the pool with `getSqlPool(payload)`, never `payload.db.pool` —
  `vercelPostgresAdapter` leaves it `undefined`.
- Payload relationship columns double the suffix: field `userId` → column
  `user_id_id`.
- Payload's bulk `update`/`delete` with `where` report per-row failures in
  `errors` instead of throwing. Check them, or use one SQL statement.
- Migrations are raw SQL files in `migrations/`, applied by hand (`push` is off).
- Vercel deploys production only from `main`; always branch from and target
  `main` (no stacked PRs).
