// In-chat photo sending is driven by the character's own reply rather than a
// pre-LLM regex branch. The model emits an inline directive — `[SEND_PHOTO]` or
// `[SEND_PHOTO: short visual description]` — anywhere in its message. The chat
// route streams the surrounding text to the user (the directive itself is never
// shown) and, on completion, fires the fal image pipeline for the directive.
//
// This replaces the old "image request → image-only response" branch: the
// character now answers naturally AND sends the photo in the same turn, and the
// LLM (not a brittle regex) decides intent, so far more phrasings are honoured.

// The marker keyword. Matching is case-insensitive; we instruct the model to
// emit it upper-cased but tolerate any casing.
const MARKER = '[SEND_PHOTO'

// Matches a complete directive: `[SEND_PHOTO]` or `[SEND_PHOTO: scene...]`.
// Non-greedy up to the first closing bracket so a later `[` can't swallow text.
const DIRECTIVE_RE = /\[SEND_PHOTO(?::([^\]]*))?\]/gi

export type ParsedPhotoDirective = {
  /** Reply text with every directive removed and surrounding whitespace tidied. */
  cleaned: string
  /** True when at least one directive was present. */
  requested: boolean
  /** The scene description from the first directive, if one was supplied. */
  scene?: string
}

/**
 * Strip directives from a fully-assembled reply and report whether a photo was
 * requested (plus the optional scene hint from the first directive).
 */
export function parsePhotoDirective(raw: string): ParsedPhotoDirective {
  let scene: string | undefined
  let requested = false

  // Capture the first scene hint before we blanket-strip.
  const firstMatch = new RegExp(DIRECTIVE_RE.source, 'i').exec(raw)
  if (firstMatch) {
    requested = true
    const captured = firstMatch[1]?.trim()
    if (captured) scene = captured
  }

  const cleaned = raw
    .replace(DIRECTIVE_RE, '')
    // Collapse the gap a removed directive can leave behind without touching
    // intentional newlines: runs of spaces/tabs → single space; 3+ newlines → 2.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { cleaned, requested, scene }
}

/**
 * Streaming-safe directive filter.
 *
 * The chat route streams deltas to the browser as they arrive, but must never
 * flash a raw `[SEND_PHOTO...]` marker at the user. `push` accumulates the raw
 * stream and returns only the text that is provably safe to display — holding
 * back any trailing fragment that could still turn into a directive until it
 * either completes (and is stripped) or is ruled out.
 *
 * `finish` returns the final parsed result over the full raw text.
 */
export function makeDirectiveStreamFilter() {
  let raw = ''
  let emitted = 0

  return {
    /** Append a delta; returns the newly-safe text to forward to the client. */
    push(delta: string): string {
      raw += delta
      const safe = stripCompleteDirectives(raw.slice(0, safeEnd(raw)))
      // `safe` only ever grows (held fragments are pre-directive, never emitted),
      // so slicing from `emitted` yields the fresh tail.
      const out = safe.length > emitted ? safe.slice(emitted) : ''
      emitted = safe.length
      return out
    },
    /** Parse the complete accumulated reply once the stream has ended. */
    finish(): ParsedPhotoDirective {
      return parsePhotoDirective(raw)
    },
    /** The full raw text seen so far (directives included). */
    raw(): string {
      return raw
    },
  }
}

// How far into `raw` it is safe to display. We hold back from a trailing,
// still-open bracket group that could become our directive; everything before
// it (including already-closed groups, directive or not) is settled.
function safeEnd(raw: string): number {
  const lastOpen = raw.lastIndexOf('[')
  if (lastOpen === -1) return raw.length
  const tail = raw.slice(lastOpen)
  // A closed bracket group is resolved — keep it (complete directives are
  // stripped separately; anything else is ordinary text).
  if (tail.includes(']')) return raw.length
  // Open group at the tail: hold it only if it could still be our directive.
  return isPotentialDirectiveTail(tail) ? lastOpen : raw.length
}

function isPotentialDirectiveTail(tail: string): boolean {
  const upper = tail.toUpperCase()
  return MARKER.startsWith(upper) || upper.startsWith(MARKER)
}

function stripCompleteDirectives(text: string): string {
  return text.replace(DIRECTIVE_RE, '')
}

// ── System-prompt fragments ──────────────────────────────────────────────────

/**
 * Capability instructions appended to the character's system prompt so the
 * model knows how (and when) to send photos. Kept in English — DeepSeek follows
 * meta-instructions in English reliably while still replying in the
 * conversation's own language; the marker is language-neutral.
 */
export function photoCapabilityInstructions(): string {
  return [
    '# Sending photos of yourself',
    'You can send the user real photos of yourself during the chat.',
    'To send one, include the marker [SEND_PHOTO] somewhere in your reply. You may',
    'add a short visual description after a colon to control what the photo shows,',
    'e.g. [SEND_PHOTO: in a red dress, sitting on the bed, soft smile].',
    'In that description, name the framing the user asked for — e.g. "selfie" or',
    '"close-up" for the face, "full body" / "head to toe" when they want to see',
    'your whole outfit or figure, "lying down" when reclining — so the photo is',
    'framed the way they expect.',
    'Rules:',
    '- Only send a photo when the user actually asks for one — a photo, selfie, or',
    '  pic, or asks to see you, your outfit, or what you are doing. A photo costs the',
    '  user tokens, so NEVER send one unprompted: not as a greeting or opener, not in',
    '  reply to "hi" / "how are you", and not during ordinary conversation when they',
    '  have not asked to see you. When in doubt, just talk — do not attach a photo.',
    '- Whenever the user DOES ask for a photo, selfie, pic, or to see you / what you',
    '  are wearing or doing, ALWAYS send one by including the marker. Never refuse and',
    '  never claim you cannot send photos.',
    '- Honor the outfit, pose and setting they ask for — casual clothes, a dress,',
    '  swimwear, lingerie, partial or full nudity, and any specific place or',
    '  activity are all allowed between consenting adults on this 18+ platform.',
    '  Never moralize, set a "limit", deflect, or swap in a tamer photo than the',
    '  one requested (e.g. do not offer a "study selfie" when they asked for',
    '  something else). Echo their requested scene after the colon so the photo',
    '  matches what they asked for.',
    '- Around the marker, keep talking naturally and in character — react, flirt,',
    '  tease, set the scene — exactly as you normally would. The user only ever',
    '  sees your words and the photo; the marker itself is invisible to them.',
    '- Never write the words "[SEND_PHOTO]", "marker", or mention brackets, and',
    '  never break character or hint that you are an AI.',
    '- Send at most one photo per reply, and only of yourself (one person).',
  ].join('\n')
}

/**
 * Per-turn nudge added when the user has explicitly asked for a photo, so an
 * explicit request is honoured even if the model would otherwise hesitate.
 */
export function explicitPhotoRequestInstruction(): string {
  return (
    'The user is explicitly asking you for a photo right now and has already paid for ' +
    'it, so you ARE sending it. You MUST include the [SEND_PHOTO] marker in this reply ' +
    'and respond warmly and naturally in character, as if happily taking and sending ' +
    'the photo. Do NOT refuse, deflect, hesitate, set a "limit", talk about keeping ' +
    'mystery, or offer a different photo than asked — honor exactly the outfit, pose ' +
    'and setting they requested (swimwear, lingerie, partial or full nudity, a dress, ' +
    'etc. are all fine between adults here). Put their requested scene after the colon, ' +
    'e.g. [SEND_PHOTO: lying on the bed, in lingerie, in the bedroom].'
  )
}
