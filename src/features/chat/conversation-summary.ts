// Rolling conversation summarization.
//
// The chat route only ever feeds the LLM the most recent 30 messages (capped at
// HISTORY_CHAR_BUDGET chars) plus `conversation.summary` — but until this module
// existed nothing ever WROTE that summary, so on any conversation longer than
// the window the character simply forgot everything older: established facts,
// pet names, running jokes, what the user does for a living. That is the single
// biggest source of "the character is inconsistent" reports.
//
// Every SUMMARY_EVERY_USER_MESSAGES user turns (fire-and-forget, off the
// request path) we merge the previous summary with the current history window
// into a fresh compact summary. Because the window slides by 1 user turn per
// message and we refresh every few turns, nothing falls out of the window
// without having been folded into the summary first.
import 'server-only'
import type { BasePayload } from 'payload'
import { OPENROUTER_MODEL } from '@/shared/ai/openrouter'
import { env } from '@/shared/config/env'
import { logger } from '@/shared/lib/logger'
import { replyLanguageName } from '@/features/chat/language-guard'

// Don't bother summarizing short conversations — the full history still fits
// the window. 24 total messages ≈ 12 user turns, comfortably inside the
// 30-message window, so the first summary is built before anything is lost.
export const SUMMARY_MIN_MESSAGES = 24

// Refresh cadence, in user messages. Must stay well under the 30-message
// window (≈15 user turns) so the window and the summary always overlap.
export const SUMMARY_EVERY_USER_MESSAGES = 6

/**
 * Whether this turn should refresh the rolling summary. `messageCount` is the
 * conversation's total message counter AFTER this turn (user + assistant, and
 * possibly an initial greeting, so it can be odd). Math.floor collapses the
 * greeting offset: the derived user-turn count advances by exactly 1 per turn,
 * so the modulo fires once every SUMMARY_EVERY_USER_MESSAGES turns.
 */
export function shouldUpdateSummary(messageCount: number): boolean {
  if (messageCount < SUMMARY_MIN_MESSAGES) return false
  return Math.floor(messageCount / 2) % SUMMARY_EVERY_USER_MESSAGES === 0
}

const SUMMARY_SYSTEM_PROMPT = `You maintain a rolling memory summary for an ongoing romantic chat between a user and an AI companion character. You will receive the previous summary (possibly empty) and the most recent messages. Produce ONE updated summary that replaces the previous one.

Keep (highest priority first):
1. Facts about the user: name, age, where they live, job, family, pets, likes/dislikes.
2. Facts the character has established about herself in this chat (so she never contradicts them later).
3. Relationship state: pet names in use, level of intimacy reached, promises or plans made, running jokes.
4. Recent emotional context: what they talked about last, unresolved threads.

Rules:
- Maximum 150 words. Plain text, no headers, no bullet markers, no commentary.
- Merge: carry forward still-relevant facts from the previous summary, update anything that changed, drop small talk.
- Never invent details that are not in the input.`

type HistoryMessage = { role: 'user' | 'assistant'; content: string }

async function generateSummary(args: {
  previousSummary: string | null
  messages: HistoryMessage[]
  language: string
  signal?: AbortSignal
}): Promise<string | null> {
  if (!env.OPENROUTER_API_KEY) return null

  const transcript = args.messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Companion'}: ${m.content}`)
    .join('\n')

  const userPrompt = [
    `Write the updated summary in ${replyLanguageName(args.language)}.`,
    '',
    `Previous summary:\n${args.previousSummary?.trim() || '(none)'}`,
    '',
    `Recent messages:\n${transcript}`,
  ].join('\n')

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 350,
    }),
    signal: args.signal ?? AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(`summary LLM call failed: ${response.status}`)
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
  const text = data.choices[0]?.message?.content?.trim() ?? ''
  return text.length > 0 ? text.slice(0, 2000) : null
}

export type UpdateSummaryInput = {
  payload: BasePayload
  conversationId: string | number
  previousSummary: string | null
  /** Chronological (oldest → newest) recent history, user+assistant only. */
  messages: Array<HistoryMessage & { id?: string | number }>
  language: string
}

/**
 * Regenerate and persist the conversation's rolling summary. Designed to be
 * called fire-and-forget after the reply has been committed — failures are
 * logged and swallowed, the previous summary stays in place.
 */
export async function updateConversationSummary(input: UpdateSummaryInput): Promise<void> {
  const { payload, conversationId, previousSummary, messages, language } = input
  if (messages.length < 4) return

  let summary: string | null
  try {
    summary = await generateSummary({ previousSummary, messages, language })
  } catch (err) {
    logger.warn({
      msg: 'chat.summary.llm_failed',
      conversationId,
      err: err instanceof Error ? err.message : err,
    })
    return
  }
  if (!summary) return

  const lastWithId = [...messages].reverse().find((m) => m.id !== undefined)

  try {
    await payload.update({
      collection: 'conversations',
      id: conversationId,
      data: {
        summary,
        summaryUpdatedAt: new Date().toISOString(),
        ...(lastWithId?.id !== undefined ? { summaryUpToMessageId: lastWithId.id } : {}),
      },
    })
    logger.info({ msg: 'chat.summary.updated', conversationId, chars: summary.length })
  } catch (err) {
    logger.warn({
      msg: 'chat.summary.save_failed',
      conversationId,
      err: err instanceof Error ? err.message : err,
    })
  }
}
