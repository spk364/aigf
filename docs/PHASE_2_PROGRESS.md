# Phase 2 + Phase 3 (in progress) — Progress

**Phase 2:** completed (2026-04-21)
**Phase 3:** in progress (started 2026-04-23)
**Last update:** 2026-04-23
**Repo:** `C:/Users/User/projects/gfai`
**Verification:** `pnpm typecheck` and `pnpm lint` both pass cleanly on 71 TypeScript files.

---

## What was built

### 1. Skeleton (Next.js 15 + Payload v3 + Postgres + Tailwind 4 + FSD + i18n)

- Next.js 15.4.11 (App Router, React 19), TypeScript 5 strict with `noUncheckedIndexedAccess`
- Payload CMS v3.83 with `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, `@payloadcms/translations`
- Tailwind CSS 4 + PostCSS
- next-intl 3 (locales: `en`, `ru`, `es`, default `en`)
- Feature-Sliced Design layout: `shared` / `entities` / `features` / `widgets` / `app`
- Zod env schema at `src/shared/config/env.ts` — validates on import, process.exit on failure
- Pino logger scaffold (upgraded in task 7)
- pgvector migration stub at `migrations/0000_pgvector.sql`
- ESLint + Prettier + `prettier-plugin-tailwindcss`

### 2. Payload collections — 14 total

| Cluster | Collections |
|---|---|
| User & Auth | `users` (Payload auth), `age-verifications` |
| Characters | `characters` (minimal — appearance/media fields deferred to Phase 3) |
| Conversations | `conversations`, `messages` |
| Billing | `subscriptions`, `token-balances`, `token-transactions`, `token-packages`, `payment-transactions`, `payment-webhooks` |
| System & Audit | `system-prompts`, `feature-flags`, `audit-logs` |

All indexes from `docs/ai-companion-data-model.md` are declared via Payload `index: true` / `indexes: []`. Soft-delete pattern via `deletedAt` column (read queries must filter on `deletedAt IS NULL` — not yet enforced via access control).

### 3. Auth + age gate + email verification

- Payload auth with `verify: true` and Resend email adapter (`@payloadcms/email-resend`)
- Signup/login/logout server actions at `src/features/auth/actions/`
- 18+ age gate: `beforeValidate` hook on `users` rejects DOB < 18
- Every signup writes an `age_verifications` audit row with IP + user-agent
- Email verification page at `/[locale]/verify-email?token=...`
- Auth helpers: `getCurrentUser()`, `requireAuth()` in `src/shared/auth/`
- Pages under `src/app/(app)/[locale]/(auth)/` + `/dashboard`
- Full i18n for auth strings in en/ru/es

### 4. Chat with SSE streaming + preset character

- OpenRouter streaming client (`src/shared/ai/openrouter.ts`) using native `fetch` + ReadableStream, model `deepseek/deepseek-chat-v3-0324`
- SSE endpoint `POST /api/chat` — conversation creation on first message with character snapshot, last-30-message context, realistic 600–1500ms typing delay, placeholder assistant message then streaming updates, graceful disconnect handling
- Regeneration endpoint `POST /api/chat/regenerate` — creates new assistant message with `regeneratedFromId` (free, no token cost)
- Seed script `src/payload/seed/seed-preset-characters.ts` — idempotent upsert of "Anna" in 3 languages sharing `localeGroupId: 'anna-mvp-v1'`
- Chat UI: `/[locale]/chat` (character + conversations list), `/[locale]/chat/new?characterId=…`, `/[locale]/chat/[conversationId]`
- `ChatInterface` client widget with fetch-based SSE consumption, auto-scroll, typing indicator, copy + regenerate actions
- Script `pnpm seed:characters` runs the seed

### 5. Token ledger + daily message quota

- Atomic `grant` / `spend` / `refundByAdmin` in `src/features/tokens/ledger.ts` using Payload DB transactions (ledger INSERT before balance UPDATE so a crash leaves the ledger ahead — validator detects)
- Upstash Redis client with in-memory `Map` fallback for local dev (`src/shared/redis/client.ts`)
- Daily message quota per UTC day: free = 10/day, premium = unlimited (`src/features/quota/message-quota.ts`)
- Quota check wired into `/api/chat` (returns 429 on exceeded, with reset time)
- Regeneration is free per spec — no quota deduction
- `users.afterChange` on create: ensures a `token_balances` row exists (starts at 0)
- Hourly ledger validator `src/features/tokens/validator.ts` + CLI `pnpm tokens:validate`
- Dashboard shows today's usage

### 6. CCBill sandbox + NOWPayments minimal + Upgrade flow

- Plan catalog `src/features/billing/plans.ts` — single source of truth for pricing and feature snapshots
- CCBill webhook at `/api/webhooks/ccbill` with idempotent save-first pattern (unique `providerEventId` on `payment-webhooks`)
- Handlers: `NewSaleSuccess`, `RenewalSuccess`, `Cancellation`, `Expiration`, `Refund`, `Chargeback`
- On success: upsert subscription + insert payment_transaction + `grant(type: 'grant_subscription', amount: plan.monthlyTokenAllocation)` — all inside one DB transaction
- NOWPayments IPN webhook with real HMAC-SHA512 signature verification — handles `payment_status: finished` for one-time token pack purchases
- Upgrade page `/[locale]/upgrade` with 3-tier pricing (Premium Monthly $12.99, Premium Yearly $99.99, Premium Plus $29.99)
- Return page `/[locale]/billing/return` — polls `/api/billing/status` every 2s up to 30s after checkout
- Manage page `/[locale]/billing/manage` with 2-click cancel flow (updates `cancelAtPeriodEnd: true` locally — real CCBill DataLink cancel is a TODO)

### 7. Observability baseline

- Sentry via Next.js 15 `instrumentation.ts` + `instrumentation-client.ts` (no-op when `SENTRY_DSN` missing)
- Pino logger with Axiom batch transport (2s interval or 50 lines, fail-silent) in production; `pino-pretty` in dev
- Request context helper `src/shared/lib/request-context.ts` — generates or reads `x-request-id`, binds to request-scoped logger
- Logger wired into chat API route + webhooks
- PostHog server client (`posthog-node`) + client provider (`posthog-js`) — autocapture DISABLED, privacy-first
- Product events instrumented: `user.signed_up`, `user.email_verified`, `chat.first_message`, `chat.message_sent`, `paywall.shown`, `purchase.succeeded`, `subscription.canceled`
- Error boundary `/error.tsx` + `global-error.tsx` with Sentry capture + i18n copy
- `next.config.ts` wraps with `withSentryConfig` (outermost) — source maps hidden in client bundle

---

## Running locally — what you need

### 1. Database setup (PostgreSQL 16 with pgvector)

You have PostgreSQL 16 on `localhost:5432`. Create a database and enable pgvector:

```sql
-- run as the postgres superuser
CREATE DATABASE gfai;
\c gfai
CREATE EXTENSION IF NOT EXISTS vector;
```

`pgvector` ships with some Postgres installers — if `CREATE EXTENSION vector` fails, install it from https://github.com/pgvector/pgvector (Windows binaries available).

### 2. Environment variables

Copy `.env.example` → `.env.local` and fill in at minimum:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/gfai
PAYLOAD_SECRET=<32+ random chars>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

All other env vars are optional for local dev — services gracefully degrade (Redis uses in-memory Map, PostHog/Sentry/Resend become no-ops, CCBill shows a dev placeholder).

### 3. Migrations + seed

```bash
pnpm install
pnpm payload:migrate        # creates all Payload tables
pnpm seed:characters        # seeds Anna in en/ru/es
pnpm dev                    # http://localhost:3000
```

First-visit flow:
1. `http://localhost:3000/en` → landing with Sign up / Log in
2. Sign up with any email + DOB ≥ 18 years ago
3. Check server console for the email-verification link (Resend is a console transport without an API key)
4. Dashboard shows quota; `/en/chat` lists Anna
5. Admin UI at `http://localhost:3000/admin`

---

## Known gaps / follow-ups for Phase 3

### Critical (block production launch)

1. **Safety pipeline** — input/output filters, scoring system, apparent age classifier for NSFW. No filters exist today.
2. **Real CCBill signature verification** — currently a shared-secret header stub; production needs the MD5 digest per CCBill docs.
3. **Real CCBill DataLink cancel** — cancel action only updates local DB.
4. **Webhook processing via Inngest** — webhooks currently process synchronously in-request.
5. **GDPR data export + deletion endpoints** — required at launch.
6. **Hourly token ledger validator scheduled** — the function exists but is not yet on a cron.

### Core features (Phase 3) — reordered per user direction

Build features first, layer safety on at the end (before any production launch).

1. ✅ **`media_assets` collection** — done (commit `4156c49`). 18 fields per spec, indexed, wired into messages (`imageAssetId`/`videoAssetId` are now relationships, not json) and characters (`primaryImageId` single + `galleryImageIds` hasMany, both optional). Supabase `media_assets` table created via Payload push.
2. ✅ **Cloudflare R2 storage + fal CDN mirroring** — done. New files: `src/shared/storage/r2.ts` (S3-compatible client wrapper with `uploadBuffer`, `mirrorFromUrl`, `deleteObject`, `buildR2Key`), `src/features/media/persist-generated-image.ts` (helper that mirrors a fal CDN URL to R2 and creates a `media-assets` row in one call). Dev test endpoint `POST /api/dev/generate-image` accepts `persist: true` to exercise the full flow. Requires R2 env vars (see "R2 setup" section below); without them, `persist: false` still returns raw fal URLs.
3. ✅ **Image generation pipeline + intent detection in chat** — done. New: `src/features/chat/intent-detection.ts` (regex-based `detectImageIntent` for en/ru/es), `src/features/chat/image-prompt.ts` (`buildImagePrompt` with hardcoded base + occupation hint + last-80-chars scene fragment). Chat route forks: image-intent → free tier sees Premium upsell text; premium with insufficient tokens sees top-up text; premium with tokens generates via fal → mirrors to R2 → saves message of type `image` with `imageAssetId` → spends 2 tokens via ledger → streams `event: image` over SSE. ChatInterface widget now renders image bubbles (max-w 320, rounded-2xl), and the conversation page batch-fetches `media-assets.publicUrl` for image messages in history. Token cost per spec 3.8: standard image = 2 tokens. Free tier blocked from image gen per spec 3.8. PostHog event `chat.image_generated` fired on success.
4. ⏳ Full `characters` schema: `appearance` jsonb, `imageModel`, `userContentPreferences`.
5. ⏳ Memory system: `memory_entries` with pgvector HNSW index, extraction job every 30 messages, top-5 retrieval.
6. ✅ **Character builder — 4-step wizard** — done. New `character-drafts` Payload collection (userId, language, currentStep, data jsonb, previewGenerations jsonb, expiresAt +7d, deletedAt). Hardcoded option catalogs in `src/features/builder/options.ts` (art styles, ethnicities, age ranges with hard min 21, body types — no petite, hair/eye/features, archetypes with defaultTraits + systemPromptFragment, meet scenarios, relationship stages). Name safety blocklist (`src/features/builder/blocklist.ts` — childlike names + celebrities). Server actions: `createDraftAction` (enforces 1-character limit on free tier), `saveDraftStepAction`, `generatePreviewsAction` (max 5 preview generations per draft, free per spec 3.3), `selectReferenceAction`, `finalizeBuilderAction` (creates characters row, flips selected media-asset kind from `character_preview` → `character_reference`, soft-deletes draft, creates first conversation, redirects to chat). UI: `/[locale]/builder` drafts index + upgrade gate, `/[locale]/builder/[draftId]` with `CharacterBuilderWizard` client widget (step indicator, 4 step forms, debounced autosave, preview thumbnail grid, finalize CTA). Full i18n for en/ru/es.
7. ⏳ Catalog page with filters, tags, content rating.
8. ⏳ `character_appearance_presets` catalog managed via admin.
9. ⏳ Admin panel enhancements: moderation queue, analytics dashboard.
10. ⏳ Relationship score computation on message send.
11. ⏳ **Safety pipeline (last, before production launch)** — input/output filters, scoring system, hard-coded negative prompts in image gen, apparent-age classifier (NSFW requires `apparentAge > 25`), `content_flags` + `safety_incidents` collections, escalation cron (3-strike ban). Must be in place before public launch — current dev environment has no filters.

### R2 setup (required before testing image persistence)

1. Cloudflare dashboard → R2 → create a bucket (any name; put in `R2_BUCKET`).
2. Bucket → Settings → enable public access. Either toggle the free `pub-<id>.r2.dev` subdomain OR connect a custom domain. Copy the resulting base URL into `R2_PUBLIC_URL` (no trailing slash).
3. R2 → Manage API tokens → create token with "Object Read & Write" on the bucket. Set `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
4. `R2_ACCOUNT_ID` is the Cloudflare Account ID visible in the right sidebar of any dashboard page.
5. Restart `pnpm dev` after editing `.env.local`.

### UX polish

- `ChatInterface` widget still has hardcoded English UI strings — thread `useTranslations` through it.
- shadcn/ui component installation + migration to polished primitives.
- Password reset UI (Payload has the REST endpoint).
- Google OAuth via `payload-oauth2` plugin.
- Mobile responsive audit (60% of expected traffic is mobile).
- `/billing/return` needs a Suspense boundary if static rendering is ever enabled.

### Data model gaps

- `characters.tags` needs a GIN index (raw SQL supplemental migration) — Payload field-level `index: true` creates a btree.
- `conversations.lastMessageAt DESC` composite descending index needs a raw SQL migration.
- `messages.imageAssetId` / `videoAssetId` are currently `json` fields — convert to relationships once `media-assets` exists.
- Partitioning for `messages`, `token_transactions`, `content_flags` once they grow — raw SQL via `afterMigrate`.
- `memory_entries` collection with `vector(1536)` field — needs a custom Payload field type or raw SQL column injection.

---

## Recommended next moves (in priority order)

1. **Run the full stack end-to-end locally** — verify migrations, seed, signup → chat → message streaming all work against a real DB.
2. **Phase 1 validation spike** (if not done) — 20–30 test fal.ai image generations through CyberRealistic Pony with safety classifier evaluation. Validate apparent-age classifier reliability before investing in the full pipeline.
3. **Legal + ops blockers** (in parallel): legal entity (Estonia / UK LTD / Cyprus), CCBill merchant application (3–6 weeks), ToS/Privacy/2257 documents on 3 languages.
4. **Phase 3 kickoff** — start with the safety pipeline (blocker for first user) before image generation itself.

---

## File inventory (top-level)

```
gfai/
├── docs/
│   ├── ai-companion-spec.md
│   ├── ai-companion-data-model.md
│   └── PHASE_2_PROGRESS.md         (this file)
├── migrations/
│   └── 0000_pgvector.sql
├── src/
│   ├── app/
│   │   ├── (app)/[locale]/         (public app: home, auth, chat, dashboard, upgrade, billing, verify-email)
│   │   ├── (payload)/              (admin + payload REST)
│   │   └── api/                    (chat, chat/regenerate, billing/status, webhooks/ccbill, webhooks/nowpayments)
│   ├── entities/
│   ├── features/
│   │   ├── auth/                   (actions, schemas)
│   │   ├── billing/                (plans, ccbill/)
│   │   ├── quota/                  (message-quota)
│   │   └── tokens/                 (ledger, validator)
│   ├── i18n/
│   │   ├── messages/{en,ru,es}.json
│   │   ├── request.ts
│   │   └── routing.ts
│   ├── middleware.ts
│   ├── payload/
│   │   ├── collections/            (14 collections)
│   │   ├── seed/
│   │   └── payload.config.ts
│   ├── shared/
│   │   ├── ai/                     (openrouter)
│   │   ├── analytics/              (posthog, posthog-client, PostHogProvider)
│   │   ├── auth/                   (current-user, require-auth)
│   │   ├── config/                 (env)
│   │   ├── lib/                    (logger, request-context)
│   │   ├── redis/                  (client)
│   │   └── ui/                     (empty — shadcn lands here)
│   ├── widgets/
│   │   └── chat-interface/
│   ├── instrumentation.ts
│   └── instrumentation-client.ts
├── .env.example
├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Google OAuth setup

### Step-by-step: create Google OAuth credentials

1. Go to https://console.cloud.google.com/ and sign in.

2. Create a new project (or select an existing one) via the project dropdown at the top.

3. **Configure OAuth consent screen**
   - Navigate to **APIs & Services → OAuth consent screen**
   - User type: **External** (unless you have a Google Workspace org)
   - Fill in: App name (e.g. "AI Companion"), user support email, developer contact email
   - Scopes: add `openid`, `email`, `profile`
   - Test users (while app is in Testing mode): add your developer email address
   - Save and continue through all steps

4. **Create OAuth credentials**
   - Navigate to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `gfai-dev`
   - Authorized redirect URIs — add:
     - `http://localhost:3000/api/users/oauth/callback` (dev)
     - Add your production URL later: `https://yourdomain.com/api/users/oauth/callback`
   - Click **Create**

5. **Copy credentials into `.env.local`**
   ```
   GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   ```
   The `GOOGLE_OAUTH_ENABLED` var is derived automatically — no need to set it manually.

6. **Restart the dev server** — env changes require a full restart (hot reload does not pick up new env vars).

### How it works

- The authorize endpoint is at `/api/users/oauth/authorize` — this is what the "Continue with Google" button links to.
- After Google redirects back, the callback at `/api/users/oauth/callback` exchanges the code for tokens, fetches user info from `https://www.googleapis.com/oauth2/v3/userinfo`, and creates or updates the user record in Payload.
- OAuth users get `emailVerified: true` automatically (Google verifies emails).
- Because `dateOfBirth` is not collected during OAuth sign-up, new OAuth users are redirected to `/[locale]/complete-profile` to enter their date of birth and confirm 18+ consent before reaching the main app. This redirect is enforced by `requireCompleteProfile()` on all main app pages.
- Existing users who sign in via Google (matching by email) are updated with `googleId`, `displayName`, and `avatarUrl` from Google on each login.
