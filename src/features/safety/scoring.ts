// Input safety scorer — pure, deterministic, no I/O. The orchestration layer
// (input-filter.ts) decides what to *do* with a verdict (record a flag, refuse,
// escalate); this module only classifies text.
//
// Implements spec §3.10 Layer 3:
//   - Hard blocks: unambiguous policy violations → refuse + high-severity incident.
//   - Combinatorial scoring: youth-amplifier vs adult-marker balance in a sexual
//     context → soft_block when the request reads as deliberately under-age-coded.
//
// Trilingual (en/ru/es) because all three are first-class markets. Underage,
// family, and non-consent terms are covered in every language; the combinatorial
// youth/adult lexicons are EN-primary with the highest-signal RU/ES terms added.
//
// Matching uses Unicode-aware word boundaries (lookarounds on \p{L}) so neither
// Latin nor Cyrillic substrings false-positive ("kid" in "kidney", "тин" in
// "тинктура"). Never use bare String.includes for a policy term.

import { CELEBRITY_NAMES } from '@/features/builder/blocklist'

export type SafetyCategory =
  | 'underage_content'
  | 'celebrity_impersonation'
  | 'violence'
  | 'bestiality'
  | 'non_consent'
  | 'csam_attempt'
  | 'combinatorial_pattern'
  | 'jailbreak_attempt'
  | 'other'

export type ScoringDetails = {
  ageMarkers: number
  youthAmplifiers: number
  adultMarkers: number
  sexualContext: boolean
  triggeredRules: string[]
}

export type ScoreResult =
  | { action: 'allow'; details: ScoringDetails }
  | {
      action: 'soft_block'
      category: SafetyCategory
      reason: string
      details: ScoringDetails
    }
  | {
      action: 'hard_block'
      category: SafetyCategory
      // CSAM-class hits get the most severe treatment downstream.
      severe: boolean
      reason: string
      matched: string[]
      details: ScoringDetails
    }

// ── term lexicons ────────────────────────────────────────────────────────────
// Lowercased, matched with Unicode word boundaries. Multi-word phrases match as
// a contiguous span (internal whitespace collapsed before matching).

const UNDERAGE_TERMS = [
  // en
  'child', 'children', 'kid', 'kids', 'minor', 'underage', 'teen', 'teenage',
  'teenager', 'preteen', 'pre-teen', 'prepubescent', 'pubescent', 'toddler',
  'infant', 'loli', 'lolita', 'shota', 'schoolgirl', 'schoolboy', 'little girl',
  'little boy', 'young girl', 'young boy', 'grade schooler', 'middle schooler',
  'jailbait', 'underaged', 'under age', 'not yet 18', 'barely legal teen',
  // ru
  'ребёнок', 'ребенок', 'дети', 'малолет', 'несовершеннолет', 'подросток',
  'школьниц', 'школьник', 'девочка', 'мальчик', 'малыш', 'лоли',
  // es
  'niño', 'niña', 'menor', 'menores', 'adolescente', 'colegiala', 'colegial',
  'preadolescente', 'infantil', 'chiquita',
]

const SCHOOL_TERMS = [
  'school', 'classroom', 'homework', 'class teacher', 'pupil', 'student council',
  'recess', 'detention', 'kindergarten', 'elementary', 'grade school',
  'школа', 'класс', 'урок', 'escuela', 'colegio', 'aula', 'clase', 'tarea',
]

const FAMILY_TERMS = [
  'daughter', 'son', 'sister', 'brother', 'mom', 'mommy', 'mother', 'dad',
  'daddy', 'father', 'stepdaughter', 'stepson', 'stepsister', 'stepbrother',
  'niece', 'nephew', 'aunt', 'uncle', 'cousin', 'granddaughter',
  'дочь', 'дочка', 'сын', 'сестра', 'брат', 'мама', 'папа', 'племянниц',
  'hija', 'hijo', 'hermana', 'hermano', 'mamá', 'papá', 'sobrina', 'sobrino',
]

const BESTIALITY_TERMS = [
  'bestiality', 'zoophilia', 'sex with animal', 'sex with a dog', 'fuck a dog',
  'fuck a horse', 'animal sex', 'knotting', 'зоофил', 'секс с животн',
  'zoofilia', 'sexo con animal',
]

const NONCONSENT_TERMS = [
  'rape', 'raping', 'raped', 'forced', 'forcing', 'non-consensual', 'nonconsent',
  'non consent', 'unconscious', 'passed out', 'drugged', 'date rape', 'molest',
  'against her will', 'against his will', 'kidnap', 'abduct', 'hostage',
  'изнасил', 'насилие над', 'без согласия', 'без сознания', 'опоил',
  'violación', 'violar', 'forzad', 'sin consentimiento', 'inconsciente', 'drogad',
]

const SEXUAL_CONTEXT_TERMS = [
  // Kept deliberately explicit — these gate the combinatorial / school / family
  // rules. Soft/romantic words (kiss, cuddle) are intentionally NOT here.
  'sex', 'sexual', 'fuck', 'fucking', 'cum', 'cumming', 'orgasm', 'naked',
  'nude', 'nudes', 'tits', 'boobs', 'breasts', 'pussy', 'cock', 'dick', 'penis',
  'vagina', 'blowjob', 'handjob', 'anal', 'penetrat', 'masturbat', 'horny',
  'aroused', 'erection', 'nipples', 'undress', 'strip', 'spread your legs',
  'секс', 'голая', 'голый', 'обнаж', 'сиськи', 'грудь', 'киска', 'член',
  'возбужд', 'мастурб', 'оргазм', 'трах',
  'sexo', 'desnud', 'follar', 'tetas', 'pecho', 'coño', 'polla', 'caliente',
  'excitad', 'masturb',
]

const YOUTH_AMPLIFIERS = [
  'petite', 'tiny', 'small', 'little', 'young', 'flat chest', 'flat-chested',
  'flatchested', 'slim', 'slender', 'skinny', 'innocent', 'pure', 'virgin',
  'inexperienced', 'childlike', 'girlish', 'baby face', 'babyface', 'youthful',
  'маленьк', 'юная', 'юный', 'невинн', 'девственн', 'неопытн', 'худеньк',
  'pequeñ', 'jovencit', 'inocente', 'virgen', 'delgadit',
]

const ADULT_MARKERS = [
  'mature', 'milf', 'experienced', 'voluptuous', 'curvy', 'fully developed',
  'full figure', 'large breasts', 'big breasts', 'wide hips', 'married for years',
  'grown woman', 'adult woman', 'middle-aged', 'cougar', 'busty', 'thick',
  'зрелая', 'опытная', 'пышная', 'фигуристая', 'взрослая женщина', 'большая грудь',
  'madura', 'experimentada', 'voluptuosa', 'curvilínea', 'mujer adulta', 'pechugona',
]

// Jailbreak / filter-evasion phrasing. Not a hard block on its own, but a
// soft signal worth logging when paired with disallowed content.
const JAILBREAK_TERMS = [
  'ignore previous instructions', 'ignore your instructions', 'developer mode',
  'dan mode', 'no restrictions', 'without any filter', 'bypass your',
  'you are not an ai', 'roleplay as a real', 'pretend you have no rules',
  'забудь инструкции', 'игнорируй правила', 'без ограничений',
  'ignora las instrucciones', 'modo desarrollador', 'sin restricciones',
]

// ── matcher ──────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Unicode word-boundary match: the term must not be flanked by other letters.
// Handles Cyrillic/Latin alike (JS \b is ASCII-only, so we use \p{L} lookarounds).
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesTerm(haystack: string, term: string): boolean {
  const re = new RegExp(`(?<!\\p{L})${escapeRegExp(term)}(?!\\p{L})`, 'u')
  return re.test(haystack)
}

function collectMatches(haystack: string, terms: string[]): string[] {
  const hits: string[] = []
  for (const t of terms) {
    if (matchesTerm(haystack, t)) hits.push(t)
  }
  return hits
}

// Detects an explicit under-18 age claim: "16 years old", "15yo", "I'm 14",
// "16 лет", "15 años". Standalone numbers without an age cue are ignored to
// avoid flagging "I have 16 messages".
function findUnderageNumber(text: string): string | null {
  const patterns = [
    /\b(\d{1,2})\s*(?:years?\s*old|yo|y\/o|yr?s?\s*old)\b/gi,
    /\bage[d]?\s*(?:of\s*)?(\d{1,2})\b/gi,
    /\b(?:i'?m|im|i am|she'?s|he'?s|she is|he is)\s*(?:only\s*)?(\d{1,2})\b/gi,
    /\b(\d{1,2})\s*(?:лет|год[а]?|годик)/gi,
    /\b(\d{1,2})\s*años?\b/gi,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n < 18) return m[0].trim()
    }
  }
  return null
}

const emptyDetails = (sexualContext: boolean): ScoringDetails => ({
  ageMarkers: 0,
  youthAmplifiers: 0,
  adultMarkers: 0,
  sexualContext,
  triggeredRules: [],
})

/**
 * Classify a user input string. Pure — call this anywhere, no DB/network.
 * Order matters: hard blocks short-circuit before the combinatorial scorer so a
 * CSAM-class hit is never downgraded to a soft block by adult markers.
 */
export function scoreText(rawText: string): ScoreResult {
  const text = normalize(rawText)
  if (!text) return { action: 'allow', details: emptyDetails(false) }

  const sexualContext =
    SEXUAL_CONTEXT_TERMS.some((t) => matchesTerm(text, t))

  // ── HARD BLOCKS (CSAM-class first) ──────────────────────────────────────────
  const underageHits = collectMatches(text, UNDERAGE_TERMS)
  const ageNumber = findUnderageNumber(rawText)
  if (underageHits.length > 0 || ageNumber) {
    const matched = [...underageHits, ...(ageNumber ? [ageNumber] : [])]
    // Underage marker in a sexual context is the most severe (CSAM attempt).
    const severe = sexualContext
    return {
      action: 'hard_block',
      category: severe ? 'csam_attempt' : 'underage_content',
      severe,
      reason: severe
        ? 'Underage marker combined with sexual context.'
        : 'Underage marker detected.',
      matched,
      details: { ...emptyDetails(sexualContext), ageMarkers: matched.length, triggeredRules: ['underage'] },
    }
  }

  if (sexualContext) {
    const schoolHits = collectMatches(text, SCHOOL_TERMS)
    if (schoolHits.length > 0) {
      return {
        action: 'hard_block',
        category: 'csam_attempt',
        severe: true,
        reason: 'School context combined with sexual content.',
        matched: schoolHits,
        details: { ...emptyDetails(true), triggeredRules: ['school+sexual'] },
      }
    }
    const familyHits = collectMatches(text, FAMILY_TERMS)
    if (familyHits.length > 0) {
      return {
        action: 'hard_block',
        category: 'non_consent',
        severe: false,
        reason: 'Incest / family roleplay combined with sexual content.',
        matched: familyHits,
        details: { ...emptyDetails(true), triggeredRules: ['family+sexual'] },
      }
    }
  }

  const bestialityHits = collectMatches(text, BESTIALITY_TERMS)
  if (bestialityHits.length > 0) {
    return {
      action: 'hard_block',
      category: 'bestiality',
      severe: false,
      reason: 'Bestiality content.',
      matched: bestialityHits,
      details: { ...emptyDetails(sexualContext), triggeredRules: ['bestiality'] },
    }
  }

  const nonConsentHits = collectMatches(text, NONCONSENT_TERMS)
  if (nonConsentHits.length > 0) {
    return {
      action: 'hard_block',
      category: 'non_consent',
      severe: false,
      reason: 'Non-consent content.',
      matched: nonConsentHits,
      details: { ...emptyDetails(sexualContext), triggeredRules: ['non_consent'] },
    }
  }

  if (sexualContext) {
    const celebHits = collectMatches(text, CELEBRITY_NAMES)
    if (celebHits.length > 0) {
      return {
        action: 'hard_block',
        category: 'celebrity_impersonation',
        severe: false,
        reason: 'Real public figure in a sexual context.',
        matched: celebHits,
        details: { ...emptyDetails(true), triggeredRules: ['celebrity+sexual'] },
      }
    }
  }

  // ── COMBINATORIAL SCORING (sexual context only) ─────────────────────────────
  const youthHits = collectMatches(text, YOUTH_AMPLIFIERS)
  const adultHits = collectMatches(text, ADULT_MARKERS)
  const jailbreakHits = collectMatches(text, JAILBREAK_TERMS)

  const details: ScoringDetails = {
    ageMarkers: 0,
    youthAmplifiers: youthHits.length,
    adultMarkers: adultHits.length,
    sexualContext,
    triggeredRules: [],
  }

  if (sexualContext && youthHits.length > 0) {
    // Weighted balance per spec: youth −2 each, adult +3 each.
    const adultnessScore = adultHits.length * 3 - youthHits.length * 2
    if (adultnessScore < 0) {
      details.triggeredRules.push('combinatorial:youth>adult')
      return {
        action: 'soft_block',
        category: 'combinatorial_pattern',
        reason: 'Ambiguous age-coded language in a sexual context.',
        details,
      }
    }
  }

  if (jailbreakHits.length > 0) {
    details.triggeredRules.push('jailbreak')
    return {
      action: 'soft_block',
      category: 'jailbreak_attempt',
      reason: 'Filter-evasion phrasing detected.',
      details,
    }
  }

  return { action: 'allow', details }
}
