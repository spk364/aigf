// TODO(safety): replace hardcoded blocklists with full safety scorer pipeline when it lands

export const CHILDLIKE_NAMES = [
  'lily', 'molly', 'lucy', 'sophie', 'emma', 'mia', 'ava', 'isabella',
  'chloe', 'grace', 'hannah', 'olivia', 'ella', 'abigail', 'madison',
  'ellie', 'lola', 'daisy', 'ruby', 'poppy',
]

export const CELEBRITY_NAMES = [
  'taylor swift', 'beyonce', 'rihanna', 'ariana grande', 'selena gomez',
  'billie eilish', 'dua lipa', 'katy perry', 'lady gaga', 'nicki minaj',
  'kim kardashian', 'kylie jenner', 'kendall jenner', 'jennifer lopez',
  'scarlett johansson', 'margot robbie', 'angelina jolie', 'jennifer aniston',
]

export type NameValidationResult =
  | { ok: true }
  | { ok: false; reason: 'childlike' | 'celebrity' | 'too_short' | 'too_long' }

export function validateName(name: string): NameValidationResult {
  const trimmed = name.trim()
  if (trimmed.length < 2) return { ok: false, reason: 'too_short' }
  if (trimmed.length > 40) return { ok: false, reason: 'too_long' }

  const lower = trimmed.toLowerCase()

  for (const blocked of CHILDLIKE_NAMES) {
    if (lower === blocked) return { ok: false, reason: 'childlike' }
  }

  for (const celeb of CELEBRITY_NAMES) {
    if (lower.includes(celeb)) return { ok: false, reason: 'celebrity' }
  }

  return { ok: true }
}
