/**
 * Layer 3: Input safety filter (pre-LLM).
 *
 * Pure detector: takes a user-authored message, returns a verdict before the
 * payload is forwarded to the LLM. See `docs/ai-companion-spec.md` §3.10
 * Layer 3 for the threat model. Two failure modes:
 *   - hard_block:  unambiguous prohibited content (underage markers, school +
 *                  sexual context, family + sexual context, bestiality,
 *                  non-consent, real celebrities + sexual context)
 *   - soft_block:  combinatorial youth amplifiers without adult markers in a
 *                  sexual context (the "adultnessScore < 0" rule from spec)
 *
 * Word-boundary regex with case-insensitive matching. Multi-language coverage
 * (en/ru/es) is intentional — same conversation locales the chat route speaks.
 *
 * Detector is sync, deterministic, and DB-free so it can be unit-tested in
 * isolation and reused by the builder/output-filter layers later.
 */
import { CELEBRITY_NAMES } from '@/features/builder/blocklist'

export type SafetyCategory =
  | 'underage_marker'
  | 'underage_numeric'
  | 'school_sexual'
  | 'family_sexual'
  | 'bestiality'
  | 'non_consent'
  | 'celebrity_sexual'
  | 'combinatorial_youth'

export type InputSafetyVerdict =
  | { ok: true }
  | {
      ok: false
      severity: 'soft_block' | 'hard_block'
      category: SafetyCategory
      matched: string[]
      sexualContext: boolean
      adultnessScore?: number
    }

// ---------------------------------------------------------------------------
// Lexicons
// ---------------------------------------------------------------------------
// Each list is matched with `\b…\b` boundaries. Multi-word entries (e.g.
// "school uniform") are matched as substrings with `\b` only at the outer
// boundaries — see `containsAny`.

const UNDERAGE_MARKERS = [
  // English
  'child', 'children', 'kid', 'kids', 'minor', 'minors', 'underage',
  'teen', 'teens', 'teenage', 'teenager', 'teenagers',
  'preteen', 'pre-teen', 'tween',
  'loli', 'lolicon', 'lolita', 'shota', 'shotacon',
  'toddler', 'infant', 'baby girl', 'baby boy',
  'little girl', 'little boy',
  'schoolgirl', 'schoolboy', 'school girl', 'school boy',
  // Russian — `*` marks a stem (matches all declensions)
  'ребенок', 'ребёнок', 'ребёнк*', 'ребенк*', 'дитя', 'дети', 'детей',
  'малыш*', 'малолет*',
  'школьниц*', 'школьник*',
  'девочк*', 'мальчик*', 'подростк*', 'подросток',
  'несовершеннолетн*',
  // Spanish
  'niño', 'niña', 'niños', 'niñas',
  'menor de edad', 'menores de edad',
  'colegiala', 'colegial',
  'adolescente', 'preadolescente',
]

const SCHOOL_TERMS = [
  // English
  'school', 'schools', 'classroom', 'class room',
  'highschool', 'high school', 'middle school',
  'elementary', 'kindergarten', 'preschool',
  'school uniform',
  // Russian
  'школа', 'школе', 'школу', 'школой', 'школьн',
  'класс', 'классе',
  // Spanish
  'colegio', 'escuela', 'aula',
  'primaria', 'secundaria', 'preparatoria',
  'uniforme escolar',
]

const FAMILY_TERMS = [
  // English
  'daughter', 'daughters', 'son', 'sons',
  'sister', 'sisters', 'brother', 'brothers',
  'mom', 'mommy', 'mother', 'mum', 'mummy',
  'dad', 'daddy', 'father',
  'aunt', 'auntie', 'uncle',
  'niece', 'nephew', 'cousin',
  'stepdaughter', 'stepson', 'stepsister', 'stepbrother',
  'stepmom', 'stepdad',
  // Russian
  'дочь', 'дочка', 'дочка', 'дочери',
  'сын', 'сынок',
  'сестра', 'сестричка', 'сестренк', 'сестрёнк',
  'брат', 'братишк',
  'мама', 'мамочка', 'мать',
  'папа', 'папочка', 'отец',
  'тётя', 'тетя', 'дядя',
  // Spanish
  'hija', 'hijo', 'hijastra', 'hijastro',
  'hermana', 'hermano', 'hermanastra', 'hermanastro',
  'mamá', 'mama', 'madre',
  'papá', 'papa', 'padre',
  'tía', 'tia', 'tío', 'tio',
  'sobrina', 'sobrino', 'prima', 'primo',
]

const BESTIALITY_TERMS = [
  // English
  'bestiality', 'zoophilia', 'zoophile',
  'sex with a dog', 'sex with dog', 'fuck a dog', 'fucking a dog',
  'sex with a horse', 'sex with horse', 'fuck a horse', 'fucking a horse',
  'sex with an animal', 'sex with animal', 'animal sex',
  // Russian
  'зоофил', 'скотоложств',
  // Spanish
  'zoofil', 'bestialismo',
]

const NON_CONSENT_TERMS = [
  // English
  'rape', 'raping', 'raped', 'rapist',
  'forced sex', 'forced into sex', 'force her to', 'force him to',
  'unconscious', 'passed out',
  'drugged', 'roofied', 'rohypnol',
  'molest', 'molested', 'molesting', 'molestation',
  'pedophile', 'pedophil', 'pedo ', 'paedophile',
  'kidnap', 'kidnapped', 'kidnapping',
  // Russian
  'изнасилов', 'насилу', 'педофил',
  'без сознани', 'опоен',
  // Spanish
  'violar', 'violación', 'violacion', 'violada', 'violado',
  'pedófilo', 'pedofilo',
  'inconsciente', 'drogada', 'drogado',
]

// Sexual context — used by both combinatorial scoring and the school /
// family / celebrity hard-block guards. Wide net; false positives here are
// acceptable because the guards require an additional category match.
const SEXUAL_CONTEXT_TERMS = [
  // English
  'sex', 'sexual', 'sexually', 'fuck', 'fucking', 'fucked',
  'porn', 'porno', 'pornographic',
  'naked', 'nude', 'nudes', 'nudity',
  'undress', 'undressed', 'undressing', 'strip', 'stripped', 'stripping',
  'masturbat', 'orgasm', 'climax', 'cum', 'cumming', 'jerk off', 'jerking off',
  'blowjob', 'blow job', 'handjob', 'rimjob', 'anal sex', 'oral sex',
  'pussy', 'cock', 'dick', 'penis', 'vagina', 'clit', 'clitoris',
  'tits', 'titties', 'boobs', 'nipple', 'nipples', 'breast',
  'horny', 'turn me on', 'turned on', 'aroused', 'arousal',
  'spread your legs', 'finger me', 'finger you',
  'erotic', 'erotica', 'kinky',
  'sit on my', 'ride me', 'ride my',
  'lick my', 'suck my',
  // Russian
  'секс', 'трах', 'голая', 'голый', 'голую', 'голым', 'голен',
  'эрот', 'порн', 'дроч', 'минет', 'кончи', 'конча',
  'возбу', 'мастурб', 'писька', 'пизд', 'хуй', 'хуе', 'член', 'сиськ', 'грудь',
  // Spanish
  'sexo', 'sexual', 'follar', 'follad', 'desnud', 'porno',
  'erótic', 'masturb', 'pene', 'verga', 'polla', 'tetas', 'pechos',
  'orgasmo', 'cachond', 'caliente',
]

const YOUTH_AMPLIFIERS = [
  'petite', 'tiny', 'little', 'young', 'small body',
  'flat chest', 'flat-chested', 'flat chested',
  'slim', 'slender', 'skinny',
  'innocent', 'pure', 'virgin', 'inexperienced',
  'baby-faced', 'babyfaced', 'youthful', 'fresh',
  'first time',
  // Russian
  'юная', 'юный', 'юное', 'малолет', 'неопытн', 'невинн',
  // Spanish
  'pequeña', 'jovencita', 'joven', 'inocente', 'virgen', 'inexperta',
]

const ADULT_MARKERS = [
  '25+', '30+', '40+',
  'mature', 'milf', 'experienced',
  'voluptuous', 'curvy', 'fully developed', 'full figure',
  'large breasts', 'big breasts',
  'wide hips', 'married for years',
  'adult woman', 'adult man', 'grown woman', 'grown-up',
  'in her twenties', 'in her thirties', 'in her forties',
  // Russian
  'взросл', 'зрелая', 'зрелый', 'опытн',
  // Spanish
  'adulta', 'adulto', 'madura', 'maduro', 'experimentada',
]

// ---------------------------------------------------------------------------
// Matching primitives
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Returns the subset of `terms` that appear in `text`. Each term gets
// Unicode-aware boundaries (`(?<!\p{L})…(?!\p{L})`) so "kid" doesn't match
// "kindergarten" but "kids" still matches "the kids". JS's built-in `\b` is
// ASCII-only and silently fails to anchor Cyrillic / accented terms, so we
// avoid it.
//
// A trailing `*` on a term marks it as a stem — useful for Russian and
// Spanish where one root has many declensions. "школьниц*" then matches
// "школьниц", "школьница", "школьницей", "школьниц".
//
// Multi-word entries (e.g. "school uniform") use the same outer boundaries.
function findMatches(text: string, terms: readonly string[]): string[] {
  const found: string[] = []
  const haystack = text.toLowerCase()
  for (const term of terms) {
    const isStem = term.endsWith('*')
    const lower = (isStem ? term.slice(0, -1) : term).toLowerCase()
    if (!lower) continue
    // Terms containing non-letter chars at the boundary (e.g. '25+',
    // 'pre-teen') can't anchor on `\p{L}`. Fall back to substring — these
    // entries are specific enough that loose matching is safe.
    const startsWithWord = /^\p{L}/u.test(lower)
    const endsWithWord = /\p{L}$/u.test(lower)
    if (!startsWithWord || (!isStem && !endsWithWord)) {
      if (haystack.includes(lower)) found.push(term)
      continue
    }
    const tail = isStem ? '\\p{L}*' : ''
    const re = new RegExp(`(?<!\\p{L})${escapeRegex(lower)}${tail}(?!\\p{L})`, 'iu')
    if (re.test(haystack)) found.push(term)
  }
  return found
}

// Detect "I'm 14", "she's 16", "16 years old", "age: 13", "13yo" — flag
// any captured number < 18. Numbers >= 18 are ignored. Uses Unicode
// boundaries so the Russian/Spanish patterns actually anchor on Cyrillic
// and accented characters.
function findUnderageNumbers(text: string): string[] {
  const matched: string[] = []
  const lower = text.toLowerCase()
  // Boundary fragments — JS's `\b` is ASCII-only and would silently fail
  // on Cyrillic words like "мне" or accented Spanish like "años".
  const L = '(?<!\\p{L})'
  const R = '(?!\\p{L})'
  const patterns = [
    new RegExp(`${L}(?:i['’]?m|i\\s+am|she['’]?s|he['’]?s|she\\s+is|he\\s+is|they['’]?re|character|persona|age(?:d)?\\s*(?:is)?|age\\s*[:=])\\s*(\\d{1,2})${R}`, 'gu'),
    new RegExp(`${L}(\\d{1,2})\\s*(?:y(?:ear)?s?\\s*old|y\\.?o\\.?|years?\\s+of\\s+age)${R}`, 'gu'),
    new RegExp(`${L}age\\s*[:=]\\s*(\\d{1,2})${R}`, 'gu'),
    // Russian: "мне 14", "ей 13 лет"
    new RegExp(`${L}(?:мне|ей|ему|её|тебе|ей|нам)\\s+(\\d{1,2})${R}`, 'gu'),
    new RegExp(`${L}(\\d{1,2})\\s*(?:лет|года|год)${R}`, 'gu'),
    // Spanish: "tengo 14 años", "ella tiene 15"
    new RegExp(`${L}(?:tengo|tiene|tienes)\\s+(\\d{1,2})${R}`, 'gu'),
    new RegExp(`${L}(\\d{1,2})\\s*años${R}`, 'gu'),
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(lower)) !== null) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n >= 1 && n < 18) {
        matched.push(`${n} (in "${m[0].trim()}")`)
      }
    }
  }
  return matched
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ScoreOptions = {
  locale?: 'en' | 'ru' | 'es' | string
}

export function scoreUserInput(
  text: string,
  _opts?: ScoreOptions,
): InputSafetyVerdict {
  void _opts // locale-specific tuning is folded into the lexicons today
  const trimmed = text.trim()
  if (!trimmed) return { ok: true }

  // -- Hard blocks (each independent; first hit wins) --

  const underageMatches = findMatches(trimmed, UNDERAGE_MARKERS)
  if (underageMatches.length > 0) {
    return {
      ok: false,
      severity: 'hard_block',
      category: 'underage_marker',
      matched: underageMatches,
      sexualContext: false,
    }
  }

  const numericMatches = findUnderageNumbers(trimmed)
  if (numericMatches.length > 0) {
    return {
      ok: false,
      severity: 'hard_block',
      category: 'underage_numeric',
      matched: numericMatches,
      sexualContext: false,
    }
  }

  const nonConsentMatches = findMatches(trimmed, NON_CONSENT_TERMS)
  if (nonConsentMatches.length > 0) {
    return {
      ok: false,
      severity: 'hard_block',
      category: 'non_consent',
      matched: nonConsentMatches,
      sexualContext: false,
    }
  }

  const bestialityMatches = findMatches(trimmed, BESTIALITY_TERMS)
  if (bestialityMatches.length > 0) {
    return {
      ok: false,
      severity: 'hard_block',
      category: 'bestiality',
      matched: bestialityMatches,
      sexualContext: false,
    }
  }

  // The remaining categories require a sexual-context co-occurrence to fire,
  // since "school", "sister", "Taylor Swift" alone are normal conversation.
  const sexualMatches = findMatches(trimmed, SEXUAL_CONTEXT_TERMS)
  const sexualContext = sexualMatches.length > 0

  if (sexualContext) {
    const schoolMatches = findMatches(trimmed, SCHOOL_TERMS)
    if (schoolMatches.length > 0) {
      return {
        ok: false,
        severity: 'hard_block',
        category: 'school_sexual',
        matched: [...schoolMatches, ...sexualMatches],
        sexualContext: true,
      }
    }

    const familyMatches = findMatches(trimmed, FAMILY_TERMS)
    if (familyMatches.length > 0) {
      return {
        ok: false,
        severity: 'hard_block',
        category: 'family_sexual',
        matched: [...familyMatches, ...sexualMatches],
        sexualContext: true,
      }
    }

    const celebrityMatches = findMatches(trimmed, CELEBRITY_NAMES)
    if (celebrityMatches.length > 0) {
      return {
        ok: false,
        severity: 'hard_block',
        category: 'celebrity_sexual',
        matched: [...celebrityMatches, ...sexualMatches],
        sexualContext: true,
      }
    }

    // Combinatorial scoring: sexual context + youth amplifiers without a
    // counterbalancing adult marker. Mirrors §3.10 Layer 3 spec.
    const youthMatches = findMatches(trimmed, YOUTH_AMPLIFIERS)
    const adultMatches = findMatches(trimmed, ADULT_MARKERS)
    if (youthMatches.length > 0) {
      const adultnessScore = adultMatches.length * 3 - youthMatches.length * 2
      if (adultnessScore < 0) {
        return {
          ok: false,
          severity: 'soft_block',
          category: 'combinatorial_youth',
          matched: [...youthMatches, ...sexualMatches],
          sexualContext: true,
          adultnessScore,
        }
      }
    }
  }

  return { ok: true }
}
