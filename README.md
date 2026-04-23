# AI Companion SaaS

A fullstack AI companion platform built on Next.js 15, Payload CMS v3, and PostgreSQL with pgvector.

- Spec: [docs/ai-companion-spec.md](docs/ai-companion-spec.md)
- Data model: [docs/ai-companion-data-model.md](docs/ai-companion-data-model.md)

## Architecture

The project uses Feature-Sliced Design (FSD) for the frontend (`entities/`, `features/`, `widgets/`), Next.js App Router with React Server Components, Payload CMS v3 embedded inside the same Next.js app (routes under `(payload)/`), next-intl for en/ru/es localization, and PostgreSQL 16 with pgvector for AI-ready storage.

## Quick start

```bash
# 1. Install pnpm if needed
npm i -g pnpm@10.33.0

# 2. Copy env and fill in required values
cp .env.example .env

# 3. Install dependencies
pnpm install

# 4. Run pgvector migration (requires a running Postgres 16 instance)
pnpm payload:migrate

# 5. Start development server
pnpm dev
```

The app runs at `http://localhost:3000`, the Payload admin panel at `http://localhost:3000/admin`.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm typecheck` | TypeScript type-check (no emit) |
| `pnpm lint` | ESLint via next lint |
| `pnpm format` | Prettier format all files |
| `pnpm payload` | Run Payload CLI |
| `pnpm payload:generate-types` | Regenerate `src/payload/payload-types.ts` |
| `pnpm payload:migrate` | Run pending Payload migrations |

## License

Proprietary — all rights reserved (TBD).
