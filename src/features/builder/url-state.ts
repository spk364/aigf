// URL-state serializer for the character builder wizard.
//
// Mirrors joi.com's flat query-string convention so the entire in-progress
// wizard state survives a refresh / share / back-button. The draft row in
// the DB is still the canonical persistence layer; the URL is the user-
// visible carrier so deep-linking works without an account.
//
// Param naming follows joi.com almost verbatim — the few extras (chatStyle,
// kinks, occupation, etc.) sit on short keys to keep URLs readable.

export type WizardURLState = {
  path: 'presets' | 'unique' | null
  step: number | null

  // Appearance
  gender: string | null
  artStyle: string | null
  ageRange: string | null
  ageDisplay: number | null
  ethnicity: string | null
  bodyType: string | null
  breastSize: string | null
  buttSize: string | null
  hairStyle: string | null
  hairLength: string | null
  hairColor: string | null
  eyeColor: string | null

  // Identity
  name: string | null
  archetype: string | null
  sexualOrientation: string | null
  occupation: string | null
  occupationCustom: string | null
  // Custom-archetype sliders (1..10).
  persDominant: number | null
  persConfident: number | null
  persPassionate: number | null
  persOutgoing: number | null
  persPlayful: number | null

  // Backstory
  chatStyle: string | null
  startingRelationship: string | null
  startingRelationshipCustom: string | null
  kinks: string[] | null

  // Unique-description path
  uniqueName: string | null
  uniquePersonality: string | null
  uniqueLooks: string | null
}

const KEYS = {
  path: 'path',
  step: 'step',
  gender: 'g',
  artStyle: 's',
  ageRange: 'ar',
  ageDisplay: 'a',
  ethnicity: 'e',
  bodyType: 'bt',
  breastSize: 'b',
  buttSize: 'bu',
  hairStyle: 'h',
  hairLength: 'hl',
  hairColor: 'hac',
  eyeColor: 'ey',
  name: 'n',
  archetype: 'pers',
  sexualOrientation: 'or',
  occupation: 'oc',
  occupationCustom: 'occ',
  persDominant: 'persdom',
  persConfident: 'persconf',
  persPassionate: 'perspas',
  persOutgoing: 'persout',
  persPlayful: 'persplay',
  chatStyle: 'cs',
  startingRelationship: 'sr',
  startingRelationshipCustom: 'src',
  kinks: 'k',
  uniqueName: 'un',
  uniquePersonality: 'up',
  uniqueLooks: 'ul',
} as const

export function emptyUrlState(): WizardURLState {
  return {
    path: null,
    step: null,
    gender: null,
    artStyle: null,
    ageRange: null,
    ageDisplay: null,
    ethnicity: null,
    bodyType: null,
    breastSize: null,
    buttSize: null,
    hairStyle: null,
    hairLength: null,
    hairColor: null,
    eyeColor: null,
    name: null,
    archetype: null,
    sexualOrientation: null,
    occupation: null,
    occupationCustom: null,
    persDominant: null,
    persConfident: null,
    persPassionate: null,
    persOutgoing: null,
    persPlayful: null,
    chatStyle: null,
    startingRelationship: null,
    startingRelationshipCustom: null,
    kinks: null,
    uniqueName: null,
    uniquePersonality: null,
    uniqueLooks: null,
  }
}

function readNumber(sp: URLSearchParams, key: string): number | null {
  const v = sp.get(key)
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function parseUrlState(sp: URLSearchParams): WizardURLState {
  const path = sp.get(KEYS.path)
  const kRaw = sp.get(KEYS.kinks)
  return {
    path: path === 'presets' || path === 'unique' ? path : null,
    step: readNumber(sp, KEYS.step),
    gender: sp.get(KEYS.gender),
    artStyle: sp.get(KEYS.artStyle),
    ageRange: sp.get(KEYS.ageRange),
    ageDisplay: readNumber(sp, KEYS.ageDisplay),
    ethnicity: sp.get(KEYS.ethnicity),
    bodyType: sp.get(KEYS.bodyType),
    breastSize: sp.get(KEYS.breastSize),
    buttSize: sp.get(KEYS.buttSize),
    hairStyle: sp.get(KEYS.hairStyle),
    hairLength: sp.get(KEYS.hairLength),
    hairColor: sp.get(KEYS.hairColor),
    eyeColor: sp.get(KEYS.eyeColor),
    name: sp.get(KEYS.name),
    archetype: sp.get(KEYS.archetype),
    sexualOrientation: sp.get(KEYS.sexualOrientation),
    occupation: sp.get(KEYS.occupation),
    occupationCustom: sp.get(KEYS.occupationCustom),
    persDominant: readNumber(sp, KEYS.persDominant),
    persConfident: readNumber(sp, KEYS.persConfident),
    persPassionate: readNumber(sp, KEYS.persPassionate),
    persOutgoing: readNumber(sp, KEYS.persOutgoing),
    persPlayful: readNumber(sp, KEYS.persPlayful),
    chatStyle: sp.get(KEYS.chatStyle),
    startingRelationship: sp.get(KEYS.startingRelationship),
    startingRelationshipCustom: sp.get(KEYS.startingRelationshipCustom),
    kinks: kRaw ? kRaw.split(',').filter(Boolean) : null,
    uniqueName: sp.get(KEYS.uniqueName),
    uniquePersonality: sp.get(KEYS.uniquePersonality),
    uniqueLooks: sp.get(KEYS.uniqueLooks),
  }
}

// Drops null/empty entries — keeps the URL terse.
export function serializeUrlState(state: WizardURLState): URLSearchParams {
  const sp = new URLSearchParams()
  const set = (key: string, v: string | number | null | undefined) => {
    if (v === null || v === undefined) return
    const s = String(v)
    if (s.length === 0) return
    sp.set(key, s)
  }
  set(KEYS.path, state.path)
  set(KEYS.step, state.step)
  set(KEYS.gender, state.gender)
  set(KEYS.artStyle, state.artStyle)
  set(KEYS.ageRange, state.ageRange)
  set(KEYS.ageDisplay, state.ageDisplay)
  set(KEYS.ethnicity, state.ethnicity)
  set(KEYS.bodyType, state.bodyType)
  set(KEYS.breastSize, state.breastSize)
  set(KEYS.buttSize, state.buttSize)
  set(KEYS.hairStyle, state.hairStyle)
  set(KEYS.hairLength, state.hairLength)
  set(KEYS.hairColor, state.hairColor)
  set(KEYS.eyeColor, state.eyeColor)
  set(KEYS.name, state.name)
  set(KEYS.archetype, state.archetype)
  set(KEYS.sexualOrientation, state.sexualOrientation)
  set(KEYS.occupation, state.occupation)
  set(KEYS.occupationCustom, state.occupationCustom)
  set(KEYS.persDominant, state.persDominant)
  set(KEYS.persConfident, state.persConfident)
  set(KEYS.persPassionate, state.persPassionate)
  set(KEYS.persOutgoing, state.persOutgoing)
  set(KEYS.persPlayful, state.persPlayful)
  set(KEYS.chatStyle, state.chatStyle)
  set(KEYS.startingRelationship, state.startingRelationship)
  set(KEYS.startingRelationshipCustom, state.startingRelationshipCustom)
  if (state.kinks && state.kinks.length > 0) sp.set(KEYS.kinks, state.kinks.join(','))
  set(KEYS.uniqueName, state.uniqueName)
  set(KEYS.uniquePersonality, state.uniquePersonality)
  set(KEYS.uniqueLooks, state.uniqueLooks)
  return sp
}

// ── DraftData ↔ WizardURLState bridge ─────────────────────────────────────

export type WizardDraftShape = {
  pathChoice?: 'presets' | 'unique'
  appearance?: Record<string, unknown>
  identity?: Record<string, unknown>
  backstory?: Record<string, unknown>
  uniqueDesc?: Record<string, unknown>
}

export function draftToUrlState(draft: WizardDraftShape, stepIdx: number): WizardURLState {
  const a = (draft.appearance ?? {}) as Record<string, unknown>
  const i = (draft.identity ?? {}) as Record<string, unknown>
  const b = (draft.backstory ?? {}) as Record<string, unknown>
  const u = (draft.uniqueDesc ?? {}) as Record<string, unknown>
  const hair = (a.hair ?? {}) as Record<string, string>
  const eyes = (a.eyes ?? {}) as Record<string, string>
  const traits = (i.traits ?? {}) as Record<string, number>

  const orNull = (v: unknown): string | null => {
    if (v === undefined || v === null) return null
    const s = String(v)
    return s.length > 0 ? s : null
  }
  const numOrNull = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    return null
  }

  const kinks = Array.isArray(b.kinks) ? (b.kinks as string[]) : null

  return {
    path: draft.pathChoice ?? null,
    step: stepIdx,
    gender: orNull(a.gender),
    artStyle: orNull(a.artStyle),
    ageRange: orNull(a.ageRange),
    ageDisplay: numOrNull(a.ageDisplay),
    ethnicity: orNull(a.ethnicity),
    bodyType: orNull(a.bodyType),
    breastSize: orNull(a.breastSize),
    buttSize: orNull(a.buttSize),
    hairStyle: orNull(hair.style),
    hairLength: orNull(hair.length),
    hairColor: orNull(hair.color),
    eyeColor: orNull(eyes.color),
    name: orNull(i.name),
    archetype: orNull(i.archetype),
    sexualOrientation: orNull(i.sexualOrientation),
    occupation: orNull(i.occupation),
    occupationCustom: orNull(i.occupationCustom),
    persDominant: numOrNull(traits.dominant),
    persConfident: numOrNull(traits.confident),
    persPassionate: numOrNull(traits.passionate),
    persOutgoing: numOrNull(traits.outgoing),
    persPlayful: numOrNull(traits.playful),
    chatStyle: orNull(b.chatStyle),
    startingRelationship: orNull(b.startingRelationship),
    startingRelationshipCustom: orNull(b.startingRelationshipCustom),
    kinks: kinks && kinks.length > 0 ? kinks : null,
    uniqueName: orNull(u.name),
    uniquePersonality: orNull(u.personality),
    uniqueLooks: orNull(u.looks),
  }
}

// Hydrate a draft-shape from URL state, layering on top of any existing
// draft values. Empty URL params don't clobber DB values — only present
// ones override.
export function applyUrlStateToDraft(
  draft: WizardDraftShape,
  url: WizardURLState,
): WizardDraftShape {
  const a = { ...((draft.appearance ?? {}) as Record<string, unknown>) }
  const i = { ...((draft.identity ?? {}) as Record<string, unknown>) }
  const b = { ...((draft.backstory ?? {}) as Record<string, unknown>) }
  const u = { ...((draft.uniqueDesc ?? {}) as Record<string, unknown>) }
  const hair = { ...((a.hair ?? {}) as Record<string, string>) }
  const eyes = { ...((a.eyes ?? {}) as Record<string, string>) }
  const traits = { ...((i.traits ?? {}) as Record<string, number>) }

  const setIf = (obj: Record<string, unknown>, key: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== '') obj[key] = v
  }

  setIf(a, 'gender', url.gender)
  setIf(a, 'artStyle', url.artStyle)
  setIf(a, 'ageRange', url.ageRange)
  setIf(a, 'ageDisplay', url.ageDisplay)
  setIf(a, 'ethnicity', url.ethnicity)
  setIf(a, 'bodyType', url.bodyType)
  setIf(a, 'breastSize', url.breastSize)
  setIf(a, 'buttSize', url.buttSize)

  setIf(hair, 'style', url.hairStyle)
  setIf(hair, 'length', url.hairLength)
  setIf(hair, 'color', url.hairColor)
  if (Object.keys(hair).length > 0) a.hair = hair
  setIf(eyes, 'color', url.eyeColor)
  if (Object.keys(eyes).length > 0) a.eyes = eyes

  setIf(i, 'name', url.name)
  setIf(i, 'archetype', url.archetype)
  setIf(i, 'sexualOrientation', url.sexualOrientation)
  setIf(i, 'occupation', url.occupation)
  setIf(i, 'occupationCustom', url.occupationCustom)

  setIf(traits, 'dominant', url.persDominant)
  setIf(traits, 'confident', url.persConfident)
  setIf(traits, 'passionate', url.persPassionate)
  setIf(traits, 'outgoing', url.persOutgoing)
  setIf(traits, 'playful', url.persPlayful)
  if (Object.keys(traits).length > 0) i.traits = traits

  setIf(b, 'chatStyle', url.chatStyle)
  setIf(b, 'startingRelationship', url.startingRelationship)
  setIf(b, 'startingRelationshipCustom', url.startingRelationshipCustom)
  if (url.kinks) b.kinks = url.kinks

  setIf(u, 'name', url.uniqueName)
  setIf(u, 'personality', url.uniquePersonality)
  setIf(u, 'looks', url.uniqueLooks)

  return {
    pathChoice: url.path ?? draft.pathChoice,
    appearance: a,
    identity: i,
    backstory: b,
    uniqueDesc: u,
  }
}
