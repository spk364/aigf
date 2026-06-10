// Reply text post-processing shared by the chat stream and greeting generation.
//
// Characters are now instructed to speak in plain dialogue and never wrap
// actions/gestures in asterisks (no "*smiles*", "*leans in*"). This is the
// deterministic backstop for that instruction: it strips any *...* action span
// the model still emits — needed because existing conversations carry a frozen
// characterSnapshot.systemPrompt (and some were built with the old
// "deep roleplay" style that explicitly asked for *italics*), so the prompt
// change alone can't reach them.

// One or more asterisks, then any run of non-asterisk / non-newline text, then
// one or more asterisks. Newline-bounded so a single stray `*` can't swallow
// several lines, and `*+ … *+` also catches `**bold**`-style emphasis.
const ACTION_SPAN_RE = /\*+[^*\n]*\*+/g

/**
 * Remove asterisk-wrapped action narration from a fully-assembled reply and
 * tidy the whitespace the removal leaves behind. A lone, unmatched `*` (e.g. a
 * stray bullet or a multiplication sign) is left untouched.
 */
export function stripActionAsterisks(text: string): string {
  if (!text.includes('*')) return text
  return text
    .replace(ACTION_SPAN_RE, '')
    // Tidy the gaps a removed span leaves: runs of spaces/tabs → single space,
    // a space stranded before punctuation → none, trailing space on a line and
    // 3+ blank lines collapsed.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.!?…;:])/g, '$1')
    .replace(/ *\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
