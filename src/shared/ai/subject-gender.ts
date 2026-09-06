// Which gender a character's generated images should depict.
//
// The chat image pipeline used to be female-only by construction: the prompt
// builders hardcoded "1girl", "adult woman", "a beautiful young woman" and a
// `(flat chest:1.4)` age negative, and the explicit path asked for female
// anatomy. On a male character that produced feminised or re-clothed output —
// the "men never come back fully naked" report. Every builder now takes a
// SubjectGender and this resolver supplies it.
//
// Gender lives in three different shapes depending on how the character was
// created, so we probe them in order of reliability:
//   1. builder characters — `appearance.gender` ('female' | 'male')
//   2. seeded boys — `category: 'boys'` on the character doc
//   3. anything else — scan the pre-assembled appearance text, which spells the
//      subject out ("caucasian 30 year old man, …", "adult man")
// Defaults to female, which is what every pre-existing character rendered as.

export type SubjectGender = 'female' | 'male'

// Word-bounded so "woman"/"women" can't satisfy the male "man"/"men" tokens —
// \b does not fire between the "o" and "m" of "woman", so `\bman\b` is safe.
const MALE_TOKENS = /\b(?:1boy|man|men|male|guy|guys|boy|boyfriend)\b/i
const FEMALE_TOKENS = /\b(?:1girl|woman|women|female|girl|girls|girlfriend)\b/i

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readGenderField(value: unknown): SubjectGender | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'male' || v === 'man' || v === 'boy') return 'male'
  if (v === 'female' || v === 'woman' || v === 'girl') return 'female'
  return null
}

/**
 * Resolve the gender to depict from a character doc (or a conversation's
 * character snapshot, which carries `appearance` but no `category`).
 */
export function resolveCharacterGender(
  character: { appearance?: unknown; category?: unknown } | null | undefined,
): SubjectGender {
  if (!character) return 'female'

  const appearance = asRecord(character.appearance)
  const direct =
    readGenderField(appearance?.gender) ??
    readGenderField(asRecord(appearance?.params)?.gender)
  if (direct) return direct

  if (character.category === 'boys') return 'male'

  const markers = appearance?.safetyAdultMarkers
  const text = [
    typeof appearance?.subjectTokens === 'string' ? appearance.subjectTokens : '',
    typeof appearance?.appearancePrompt === 'string' ? appearance.appearancePrompt : '',
    Array.isArray(markers) ? markers.filter((m) => typeof m === 'string').join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Only call it male when the text says male and never says female — a mixed
  // description (rare) keeps the safe historical default.
  if (text && MALE_TOKENS.test(text) && !FEMALE_TOKENS.test(text)) return 'male'
  return 'female'
}
