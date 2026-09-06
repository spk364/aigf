// Reply text post-processing shared by the chat stream and greeting generation.
//
// Three classes of model output must never reach the chat bubble:
//
//  1. Asterisk action narration ("*smiles*", "*leans in*"). Characters are
//     instructed to speak in plain dialogue, but existing conversations carry a
//     frozen characterSnapshot.systemPrompt (some built with the old "deep
//     roleplay" style that explicitly asked for *italics*), so the prompt change
//     alone can't reach them.
//  2. Bracketed stage directions ("[Photo: Jade sprawled across black silk
//     sheets…]", "[the photo sends with a quiet shutter sound]"). The model
//     describes the scene instead of — or alongside — speaking it, which reads
//     as the model's notes rather than the character's voice.
//  3. Planning / reasoning commentary ("Okay, the user is asking for a photo. I
//     should stay in character and keep it flirty…"), including <think> blocks.
//     DeepSeek emits these when the system-prompt stack gets long.
//
// The deterministic backstops live here so both the streaming path (see
// {@link makeReplyStreamFilter}) and the final committed text agree.

// One or more asterisks, then any run of non-asterisk / non-newline text, then
// one or more asterisks. Newline-bounded so a single stray `*` can't swallow
// several lines, and `*+ … *+` also catches `**bold**`-style emphasis.
const ACTION_SPAN_RE = /\*+[^*\n]*\*+/g

// A complete `[...]` group. `[^\][]*` can't cross another bracket, so an
// unmatched `[` earlier in the text can never swallow real dialogue.
const BRACKET_SPAN_RE = /\[[^\][]*\]/g
// A `[...` group left unterminated at the very end — narration cut off by the
// token limit.
const TRAILING_BRACKET_RE = /\[[^\][]*$/

// Reasoning tags, closed or left open by a truncated stream.
const THINK_TAG_RE = /<\s*(think|thinking|reasoning|analysis)\s*>[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/gi

// Phrases that only ever appear when the model is talking *about* the reply
// instead of writing it. Deliberately narrow: a character speaking to their
// partner never calls them "the user", never discusses "the system prompt", and
// never announces what their response "should" do. Cyrillic patterns skip `\b`
// — JS word boundaries are ASCII-only and would never match before "п".
const META_MARKERS: RegExp[] = [
  /\bthe user\b/i,
  /\bthe assistant\b/i,
  /\bel usuario\b/i,
  /пользовател/i,
  /\bI (?:should|need to|have to|must|will|'ll|am going to) (?:respond|reply|answer|keep it|keep this|start|open|stay|avoid|acknowledge|include|mention|match|balance|make it|show)\b/i,
  /\b(?:my|the|this) (?:response|reply|answer|message) (?:should|needs|must|has to|will be)\b/i,
  /\b(?:respond|reply|answer|write|speak)ing (?:as|in the voice of) [A-Z]/,
  /\b(?:in|out of) character\b/i,
  /\bbreak(?:ing)? character\b/i,
  /\bsystem prompt\b/i,
  /\bguardrails?\b/i,
  /\bas an ai\b/i,
  /\b(?:large )?language model\b/i,
  /\brole-?play(?:ing)? (?:as|the)\b/i,
  /(?:мне )?нужно ответить/i,
  /я должн[ая]\s+(?:ответить|отреагировать|написать|быть)/i,
  /мой ответ (?:должен|будет)/i,
  /в образе/i,
  /от лица (?:персонажа|героини|героя)/i,
  /систем\w*\s+промпт/i,
]

// End of a complete sentence: terminator, optional closing quote/bracket, then
// whitespace. Requiring the whitespace means a sentence is only "complete" once
// the next one has started — safe to use mid-stream. Non-global: `exec` on a
// sticky/global regex would carry `lastIndex` between calls.
const SENTENCE_END_RE = /[.!?…]["'”’)]?\s+/

// How much of the reply's opening is held back while deciding whether it is
// planning commentary. Markers land in the first few words in practice, so this
// costs a fraction of a second and only on the very first chunk.
const DECIDE_WINDOW = 80

/** True when this span of text reads as commentary about the reply. */
export function looksLikeMetaCommentary(text: string): boolean {
  if (!text.trim()) return false
  return META_MARKERS.some((re) => re.test(text))
}

/**
 * Remove asterisk-wrapped action narration from a fully-assembled reply and
 * tidy the whitespace the removal leaves behind. A lone, unmatched `*` (e.g. a
 * stray bullet or a multiplication sign) is left untouched.
 */
export function stripActionAsterisks(text: string): string {
  if (!text.includes('*')) return text
  return tidyWhitespace(text.replace(ACTION_SPAN_RE, ''))
}

/**
 * Remove bracketed stage directions. Runs after the [SEND_PHOTO] directive has
 * already been parsed out, so every remaining `[...]` group is narration.
 */
export function stripBracketNarration(text: string): string {
  if (!text.includes('[')) return text
  return tidyWhitespace(text.replace(BRACKET_SPAN_RE, '').replace(TRAILING_BRACKET_RE, ''))
}

/**
 * Remove the model's planning commentary.
 *
 * Works paragraph-first: a reply that plans in one block and speaks in the next
 * keeps only the speaking blocks. When *every* block reads as planning — the
 * usual shape being a single paragraph that opens with the plan and then slides
 * into dialogue — it falls back to dropping the offending sentences, so a reply
 * that did contain dialogue is never emptied out.
 */
export function stripMetaCommentary(text: string): string {
  const withoutTags = text.includes('<') ? text.replace(THINK_TAG_RE, '') : text
  if (!withoutTags.trim()) return ''

  const blocks = withoutTags.split(/\n{2,}/)
  const kept = blocks.filter((b) => !looksLikeMetaCommentary(b))
  if (kept.length === blocks.length) {
    return withoutTags === text ? text : tidyWhitespace(withoutTags)
  }
  if (kept.length > 0) return tidyWhitespace(kept.join('\n\n'))

  const sentences = splitSentences(withoutTags).filter((s) => !looksLikeMetaCommentary(s))
  return tidyWhitespace(sentences.join(' '))
}

/**
 * The full backstop applied to any assistant text before it is committed:
 * planning commentary, then bracketed narration, then asterisk actions.
 * Commentary goes first so a stage direction can't hide a marker from the
 * paragraph check, and brackets go before asterisks because a stripped bracket
 * can leave an asterisk span adjacent to punctuation.
 */
export function sanitizeReplyText(text: string): string {
  return tidyWhitespace(stripActionAsterisks(stripBracketNarration(stripMetaCommentary(text))))
}

/**
 * Streaming counterpart of {@link sanitizeReplyText}, for text that has already
 * had the [SEND_PHOTO] directive removed.
 *
 * `push` returns only the text that is safe to show right now: it holds back a
 * half-written `[...` group, drops completed ones, and withholds the opening of
 * the reply just long enough to tell planning commentary from dialogue. Without
 * the hold-back the reasoning is streamed to the bubble and then yanked away by
 * the end-of-stream `replace`, which is exactly the flicker users notice.
 *
 * `flush` releases whatever is still held once the stream ends. The caller must
 * still reconcile against {@link sanitizeReplyText} of the full reply — that
 * result is authoritative, this filter only keeps the live bubble clean.
 */
export function makeReplyStreamFilter() {
  let raw = ''
  // Characters of the bracket-cleaned text already handed to `step`.
  let consumed = 0
  let mode: 'deciding' | 'skipping' | 'open' = 'deciding'
  let pending = ''

  // The portion of `raw` that is settled with respect to bracket groups, with
  // the complete ones removed.
  const settled = (): string => {
    const lastOpen = raw.lastIndexOf('[')
    const end = lastOpen === -1 || raw.indexOf(']', lastOpen) !== -1 ? raw.length : lastOpen
    return raw.slice(0, end).replace(BRACKET_SPAN_RE, '')
  }

  const step = (fresh: string, final: boolean): string => {
    if (mode === 'open') return fresh
    pending += fresh

    if (mode === 'deciding') {
      if (looksLikeMetaCommentary(pending)) {
        mode = 'skipping'
      } else if (final || pending.length >= DECIDE_WINDOW) {
        // Long enough without a marker — this is dialogue. Release it and stop
        // inspecting; the rest of the reply streams token by token.
        mode = 'open'
        const out = pending
        pending = ''
        return out
      } else {
        return ''
      }
    }

    // Planning detected: resume at the paragraph break that separates it from
    // the reply, or at the first completed sentence that no longer reads as
    // planning.
    const brk = /\n{2,}/.exec(pending)
    if (brk) {
      const out = pending.slice(brk.index + brk[0].length)
      pending = ''
      mode = 'open'
      return out
    }
    for (;;) {
      const m = SENTENCE_END_RE.exec(pending)
      if (!m) break
      const end = m.index + m[0].length
      if (looksLikeMetaCommentary(pending.slice(0, end))) {
        pending = pending.slice(end)
        continue
      }
      mode = 'open'
      const out = pending
      pending = ''
      return out
    }

    if (final) {
      const out = looksLikeMetaCommentary(pending) ? '' : pending
      pending = ''
      mode = 'open'
      return out
    }
    return ''
  }

  return {
    /** Append directive-free text; returns what is now safe to display. */
    push(delta: string): string {
      raw += delta
      const s = settled()
      if (s.length <= consumed) return ''
      const fresh = s.slice(consumed)
      consumed = s.length
      return step(fresh, false)
    },
    /** Release everything still held back once the stream has ended. */
    flush(): string {
      const s = stripBracketNarration(raw)
      const fresh = s.length > consumed ? s.slice(consumed) : ''
      consumed = s.length
      return step(fresh, true)
    },
  }
}

function tidyWhitespace(text: string): string {
  return (
    text
      // Tidy the gaps a removed span leaves: runs of spaces/tabs → single space,
      // a space stranded before punctuation → none, trailing space on a line and
      // 3+ blank lines collapsed.
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([,.!?…;:])/g, '$1')
      .replace(/ *\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
