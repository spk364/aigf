# Roadmap: User Dashboard, Integrations, Billing & Settings

Status: planning, not implemented. Created 2026-05-03.

## Current state (baseline)

- `/[locale]/dashboard` — minimal: greeting, daily message quota card, "Start chatting" CTA, logout. No view of created characters, no conversations list, no profile/settings, no integrations, no billing.
- `/[locale]/builder` — separate page with list of in-progress drafts and a "Start new" button.
- `/[locale]/chat` — separate page listing conversations.
- `/[locale]/upgrade` — separate billing page.

The dashboard does not currently aggregate any of these. The user lands there post-signup and has nowhere meaningful to go.

## Goal

Turn `/[locale]/dashboard` into the user's home screen — single place where they see what they have, jump into anything, and access settings. Build it iteratively in 4 milestones.

---

## M1 — Dashboard "home" view

**Scope:** replace current dashboard layout with three-section home.

### Sections

1. **My companions** — grid of cards from `characters` collection where `kind=custom` AND `createdBy=user.id` AND `deletedAt IS NULL`.
   - Each card: primary image, name, archetype, last-conversation timestamp.
   - Card click → `/[locale]/chat/[conversationId]` (most recent conversation) or `/chat/new?characterId=X` if none.
   - "Edit" button on hover → `/[locale]/builder/[draftId]` if a draft exists, otherwise opens an "edit character" surface (out of scope here, link to existing character page).
   - "+ Create new" tile at the end → `/[locale]/start` (the existing onboarding wizard, since it now does real generation).

2. **Recent conversations** — list of last 10 from `conversations` where `userId=user.id` and `status=active`, sorted by `updatedAt DESC`.
   - Each row: companion avatar, name, last message snippet, relative time.
   - Click → `/[locale]/chat/[conversationId]`.
   - "View all" link → `/[locale]/chat`.

3. **Quota & plan strip** — keep the existing quota card; add plan label (Free / Premium) and "Upgrade" CTA when free.

### Drafts

If user has any `character-drafts` (in-progress builder), surface them as a small "Continue building" strip above "My companions". Today this lives at `/[locale]/builder` — moving it to dashboard removes the need to navigate there.

### Files to touch

- `src/app/(app)/[locale]/dashboard/page.tsx` — full rewrite.
- new `src/widgets/dashboard/MyCompanions.tsx`, `RecentConversations.tsx`, `DraftsStrip.tsx` — server components (data fetched in parents and passed in).
- new `src/features/dashboard/queries.ts` — `getUserCompanions`, `getRecentConversations`, `getActiveDrafts` helpers.
- update i18n strings in `src/i18n/messages/{en,ru,es}.json`.

### Acceptance

- Single dashboard page shows companions + drafts + conversations + quota in a responsive grid.
- All links route correctly to existing pages.
- No new collections or migrations needed.

---

## M2 — Settings & profile

**Scope:** `/[locale]/settings` — a hub with subpages.

### Subpages

1. **Profile** (`/settings/profile`) — display name, locale, avatar (already exists in `users` collection — just expose UI). Edit form → reuse `payload.update({ collection: 'users', ... })`.
2. **NSFW gate** (`/settings/content`) — toggle `users.nsfwEnabled` checkbox. Already in schema, just no UI today.
3. **Notifications** (`/settings/notifications`) — placeholder; show "coming soon" + email-newsletter toggle (`users.subscribeNewsletter` if already exists; if not, add).
4. **Account** (`/settings/account`) — change password, delete account (soft-delete sets `deletedAt`). Use existing Payload reset-password flow.
5. **Billing** → links out to M3.
6. **Integrations** → links out to M4.

### Layout

Left rail with subpage navigation (Profile / Content / Notifications / Account / Billing / Integrations) + content area on the right. Mobile = single-column with breadcrumb.

### Files

- new `src/app/(app)/[locale]/settings/layout.tsx` — left rail + content shell.
- new `src/app/(app)/[locale]/settings/{profile,content,notifications,account}/page.tsx`.
- new `src/widgets/settings/SettingsNav.tsx`.
- new `src/features/settings/actions.ts` — `updateProfileAction`, `toggleNsfwAction`, `softDeleteAccountAction`.

### Acceptance

- All five subpages render and persist changes via existing Payload collections.
- Header dropdown (currently has Logout) gains a "Settings" link.

---

## M3 — Billing (stub)

**Scope:** UI shell only. No real wiring to CCBill / NOWPayments yet — that's deferred to a later epic.

### Subpages (all stubs)

1. **`/settings/billing`** — show static "Free" plan label and a "Change plan" button leading to `/upgrade` (already exists). No live subscription state.
2. **`/settings/billing/methods`** — empty state: "No payment methods yet. Coming soon." Disabled "Add card" / "Add crypto wallet" buttons.
3. **`/settings/billing/history`** — empty state: "No invoices yet."

### What stays out

- No reads from `subscriptions` / `transactions` even if they exist — keep this surface purely cosmetic until the M3-real epic lands.
- Don't touch existing `/billing/manage` flow — leave it alone for users who got there via direct link.
- No new collections, no schema changes.

### Files

- new `src/app/(app)/[locale]/settings/billing/{page,methods/page,history/page}.tsx` — three thin stub pages.
- new `src/widgets/settings/BillingStub.tsx` if needed for shared empty-state styling.

### Acceptance

- All three subpages render with clear "stub / coming soon" messaging.
- Settings → Billing tile shows up and links to `/settings/billing`.
- "Change plan" link works (goes to existing `/upgrade`).
- Nothing crashes if user has no subscription record.

---

## M4 — Integrations (stubs)

**Scope:** `/settings/integrations` — connect external chat platforms. Stubs only; no actual messaging bridges yet.

### Tiles

1. **Telegram** — "Connect" button → opens `https://t.me/<bot>?start=<linkToken>` in a new tab. Backend creates `integration-links` row with one-shot token; bot reads token on /start and writes `userId` back. Stub for now: just store the link request, show "Pending" state, a "Disconnect" button.
2. **Discord** — same pattern with Discord OAuth or bot DM start link.
3. **WhatsApp** — placeholder, "Join the waitlist".
4. **iMessage** — placeholder, no plan yet.
5. **API access** — for advanced users; placeholder until later.

### Schema

New collection `integrations`:
- `userId` (relation to users)
- `provider` (enum: telegram / discord / whatsapp)
- `status` (pending / connected / revoked)
- `externalId` (string — telegram chat id / discord user id, nullable until connected)
- `linkedAt`, `revokedAt`
- `metadata` (json — bot username, etc.)

### What "connected" actually does in M4

Nothing — purely a UI/data shell so we can:
- Show "Connected as @username" once the backend bridge exists.
- Generate one-shot link tokens.
- Wire actual message-relay in a later milestone (M5+, out of scope here).

### Files

- new `src/payload/collections/integrations.ts` + add to `payload.config.ts`.
- new migration.
- new `src/app/(app)/[locale]/settings/integrations/page.tsx`.
- new `src/features/integrations/{actions,queries}.ts` — `createLinkToken`, `disconnectIntegration`, `listIntegrations`.
- placeholder backend webhook routes `src/app/api/integrations/{telegram,discord}/webhook/route.ts` returning 501 with TODO.

### Acceptance

- Settings → Integrations renders the four tiles with correct connected/pending state.
- Telegram & Discord tiles can issue link tokens and show a deeplink.
- Disconnect works (sets `status=revoked`).
- No real message relay yet — that's a separate epic.

---

## Sequencing recommendation

- M1 first — biggest user-visible win, no schema churn, ~1 day of work.
- M2 second — unlocks NSFW toggle (currently no UI for the existing `users.nsfwEnabled` field), and gives a place to put M3/M4 entry points.
- M3 third — pure UI stub, very small (a few static pages). Real billing wiring is a separate, later epic.
- M4 last — needs schema + bot setup; the UI shell can ship without the actual bots running.

## Out of scope here (intentionally deferred)

- Image generation cost control / token economy beyond message quota.
- Image gallery for each character.
- Voice / video chat features.
- Real-time bridges to Telegram/Discord (M5+).
- Admin / moderation surfaces (separate spec).
