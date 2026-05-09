// Centralised age-safety markers for character image prompts.
//
// Policy (per product decision 2026-05-08):
//   - realistic art style → 21+ minimum, "21 year old" baseline. Tighter
//     guard for photorealistic outputs that are visually indistinguishable
//     from real photos.
//   - anime art style → 18+ minimum kept. Anime aesthetic is conventionally
//     stylised; 21+ would push the look toward "mature adult" and lose the
//     joi-style young-adult vibe the product is built around.
//
// When the call site has no art-style context, default to the stricter
// realistic-21+ policy. Fal/Atlas safety scorers and the apparent-age
// classifier downstream still apply on top of these markers.

export type ArtStyleHint = 'realistic' | 'anime' | null | undefined

export type AgePolicy = {
  minAge: number
  defaultBaselineAge: number
  // Positive-prompt safety phrase. Always include — bracketed weights are
  // already baked in for SDXL/Pony/FLUX prompt parsers.
  //
  // Weight tuning lesson (2026-05-09): a 1.4 weight on `(21+ years old:1.4)`
  // pulled rendered ages UP into the 30-40s because RealVisXL averages
  // across the open-ended `21+` range whenever that token outweighs the
  // specific age anchor. Safety markers are kept at 1.2 (just enough to
  // deter under-21 outputs) and the specific-age anchor lives separately
  // at 1.4 so it dominates. `(adult:...)` bumped down to 1.1 — the word
  // "adult" alone biases toward 30+ if it's any louder.
  positiveMarkers: string
  // High-weight subject anchor — render-target age. Callers should plug
  // their picked age in here when available, otherwise fall back to this.
  // Weight here MUST be >= the highest weight inside positiveMarkers, or
  // the model averages across the policy range instead of locking on
  // the chosen age.
  baselineSubject: string
  // Pre-built youth descriptor inserted alongside the subject anchor on
  // the realistic channel. Pulls the model away from the photo-stock
  // "mid-30s mature" prior toward visibly young-adult outputs.
  youthDescriptor: string
}

const ANIME_POLICY: AgePolicy = {
  minAge: 18,
  defaultBaselineAge: 19,
  positiveMarkers: '(adult:1.1), (18+ years old:1.2), (legal age:1.2)',
  baselineSubject: '(19 year old:1.4)',
  youthDescriptor: 'young adult, youthful',
}

const REALISTIC_POLICY: AgePolicy = {
  minAge: 21,
  defaultBaselineAge: 22,
  positiveMarkers: '(adult:1.1), (21+ years old:1.2), (legal age:1.2)',
  baselineSubject: '(22 year old:1.4)',
  youthDescriptor: 'young adult, youthful skin, fresh face',
}

export function getAgePolicy(artStyle: ArtStyleHint): AgePolicy {
  return artStyle === 'anime' ? ANIME_POLICY : REALISTIC_POLICY
}

// Convenience for legacy "(adult woman, (18+ years old:1.3))" call sites.
// Returns the comma-separated marker block ready to splice into a prompt.
export function getSafetyAdultMarkerString(artStyle: ArtStyleHint): string {
  const p = getAgePolicy(artStyle)
  return `adult woman, ${p.positiveMarkers}`
}

// Clamps any provided age up to the policy minimum. Use in prompt builders
// where the user-picked age might fall below the new guard.
export function clampToMinAge(age: number, artStyle: ArtStyleHint): number {
  return Math.max(getAgePolicy(artStyle).minAge, age)
}
