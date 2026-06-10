# Design revamp #1 — Depth, hierarchy & color/glow

> Goal: the app currently reads as a flat, utilitarian dark catalog. Make it feel
> like an intimate, premium product by introducing **visual depth**, a clear
> **hierarchy/focal point**, and **mood lighting** (accent glow) — without a
> ground-up rewrite. Foundation changes are token-level so every screen benefits
> at once.

## Diagnosis (from live review of home / chat / login)

- **No elevation ladder.** `--color-bg #0b0a10`, `--color-surface #151320`,
  `--color-border #2b2740` sit within a few % lightness of each other → cards
  don't separate from the background; everything melts into one dark plane.
- **No hierarchy.** Home is a uniform wall of equal-weight tiles; only the hero
  is large. Nothing guides the eye → "stock-catalog" feel.
- **Monotone darkness.** The pink/purple accent only appears on buttons/badges.
  ~90% of the surface is near-black. No glow, no ambient light, no mood — which
  undersells a sensual/companionship brand.

## Approach (token-first, then apply)

### Iteration 1 — foundation + first visible win  ← current
1. **Surface & elevation ladder** (`globals.css @theme`): widen the lightness
   steps, add an `--color-elevated` tier and a hairline-highlight border.
2. **Shadow + glow tokens**: `--shadow-card`, `--shadow-raised`, `--shadow-glow`
   (accent radial) → generate `shadow-*` utilities (Tailwind v4).
3. **Ambient background**: layered low-opacity accent radial-gradients on `body`
   (`background-attachment: fixed`) → mood lighting behind all content.
4. **Card elevation + delight**: shared character tile (`CharactersGrid` /
   `CharacterCardMedia`) gets `shadow-card`, refined hover (lift + accent border
   + glow), stronger scrim for label legibility.
5. **Hero focal point**: dashboard `HeroBanner` — more cinematic ratio, accent
   glow ring, raised shadow so it clearly anchors the page.

### Iteration 2 — hierarchy in the grid
- Size rhythm: featured/spotlight tile spanning 2×2, varied row weights instead
  of a uniform grid.
- Split or visually unify the **photoreal vs anime** tonal clash.
- Spacing/rhythm pass (section gaps, vertical breathing room).

### Iteration 3 — chat ambiance (the core surface)
- Treat the 3-column dev-tool layout: portrait presence, bubble styling, ambient
  lighting keyed to the companion, input-bar polish.

## Out of scope (logged, not design)
- Default `Caucasian` filter shows "No matches yet" on home load (state bug).
- 13 console errors on the chat route (likely image/API 404s).

## Status
- [x] It.1: surface ladder (`bg/surface/surface-2/elevated/border/border-strong`)
      + shadow/glow tokens (`shadow-card/raised/glow`) + ambient body glow
- [x] It.1: card elevation + hover delight applied systemically across home tiles
      (`CharactersGrid`, `LiveAction`, `DiscoverStrip`, `MyCompanions`) — resting
      `shadow-card`, hover lift + accent border + `shadow-glow`, media zoom
- [x] It.1: hero focal point (`HeroBanner` → `shadow-raised`)
- [x] It.2: grid size-rhythm — first tile promoted to a 2×2 **spotlight** (sm+,
      gated on >6 results) with "Featured" pill + larger name; `grid-flow-row-dense`
      so the rest reflow around it. Grid now reads as a curated feed, not a wall.
- [ ] It.2 (deferred — needs product call): **photoreal vs anime split.** Home grid
      mixes realistic + anime → tonal clash. Options: filter home grid to realistic
      (anime lives under the Anime genre tab), or add a Realistic/Anime sub-toggle.
      Not done unilaterally — it's a data/product decision, not pure styling.
- [x] It.3: chat ambiance — code done, typecheck clean (visual verify blocked by
      an unrelated node_modules corruption, see note):
      - ambient accent glow layer in chat root (was solid bg → killed app glow)
      - bubbles: assistant `shadow-card`, user bubble soft accent glow; draft +
        typing bubbles `shadow-card`; composer `shadow-raised`
      - bumped blurred-backdrop presence (0.07 → 0.10)
      - **bug fix**: pending-image skeleton referenced undefined `--color-surface-3`
        (broke the shimmer) → now `--color-elevated`

## Environment note (blocker for live verify)
Dev server hit a Build Error: `ENOENT … tslib@2.8.1/…/tslib.es6.mjs`. The package
dirs `node_modules/.pnpm/tslib@2.8.1/.../tslib` and `…/js-yaml@4.1.1/.../js-yaml`
are **empty** — broader node_modules corruption (multiple packages lost their
files; typical of AV quarantine / FS glitch), unrelated to the design edits.
Fix: a clean reinstall — `pnpm install --force` (or rm -rf node_modules && pnpm i).
