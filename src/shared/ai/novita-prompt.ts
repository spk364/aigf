// Pure prompt helpers for the Novita adapter — kept out of novita.ts (which is
// `server-only`) so they can be unit-tested without the server-only import.

// Novita's txt2img schema caps prompt AND negative_prompt at 1024 chars and 400s
// the whole request when either overruns. Our realistic negative (character
// negativePrompt + safety + iris + pony + framing) routinely exceeds that, which
// silently failed every realistic photo.
export const NOVITA_MAX_PROMPT = 1024

/**
 * Trim a prompt/negative to Novita's 1024-char limit at the last comma boundary
 * under the cap, so we drop whole tokens rather than a half-weighted one.
 */
export function capPrompt(text: string): string {
  if (text.length <= NOVITA_MAX_PROMPT) return text
  const head = text.slice(0, NOVITA_MAX_PROMPT)
  const lastComma = head.lastIndexOf(',')
  return (lastComma > 0 ? head.slice(0, lastComma) : head).trim()
}
