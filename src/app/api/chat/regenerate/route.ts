// Text regeneration is free per spec 3.8 — no quota / token deduction

export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { z } from 'zod'
import { getCurrentUser } from '@/shared/auth/current-user'
import { streamChatCompletion, OPENROUTER_MODEL } from '@/shared/ai/openrouter'
import { checkRateLimit, rateLimitHeaders, rateLimitResponseBody } from '@/shared/rate-limit/limiter'
import { CHAT_REGENERATE_LIMIT } from '@/shared/rate-limit/presets'
import { checkAssistantOutput } from '@/features/safety/output-filter'
import { parsePhotoDirective } from '@/features/chat/photo-directive'
import { makeReplyStreamFilter, sanitizeReplyText } from '@/features/chat/sanitize-reply'
import { buildOutputGuard, resolveReplyLocale } from '@/features/chat/language-guard'
import { buildStyleGuard } from '@/features/chat/style-guard'
import {
  resolveRelationshipStage,
  buildRelationshipBlock,
} from '@/features/chat/relationship-stage'
import { getAccountState } from '@/shared/auth/account-status'

// Keep aligned with chat/route.ts — see note there on temperature choice.
const LLM_TEMPERATURE = 0.85
const LLM_MAX_TOKENS = 400
const HISTORY_CHAR_BUDGET = 14_000

const bodySchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
})

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = getAccountState(user)
  if (access.blocked) {
    return NextResponse.json({ error: `account_${access.reason}`, until: access.until }, { status: 403 })
  }

  const rl = await checkRateLimit(CHAT_REGENERATE_LIMIT, `u:${user.id}`)
  if (!rl.allowed) {
    return NextResponse.json(rateLimitResponseBody(rl), {
      status: 429,
      headers: rateLimitHeaders(rl),
    })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { conversationId, messageId } = parsed.data
  const payload = await getPayload({ config })

  // depth:0 — see chat/route.ts: only scalar ids + own columns are needed.
  const conversation = await payload.findByID({
    collection: 'conversations',
    id: conversationId,
    depth: 0,
  })
  if (!conversation || conversation.deletedAt) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const convUserId =
    typeof conversation.userId === 'object' && conversation.userId !== null
      ? (conversation.userId as { id: string | number }).id
      : conversation.userId

  if (String(convUserId) !== String(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const oldMessage = await payload.findByID({ collection: 'messages', id: messageId, depth: 0 })
  if (!oldMessage) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  await payload.update({
    collection: 'messages',
    id: messageId,
    data: { isRegenerated: true },
  })

  const newAssistantMsg = await payload.create({
    collection: 'messages',
    data: {
      conversationId: conversationId,
      role: 'assistant',
      type: 'text',
      status: 'streaming',
      content: '',
      regeneratedFromId: messageId,
    },
    // Only the id is used — skip relationship hydration on the write.
    depth: 0,
  })
  const newMsgId = String(newAssistantMsg.id)

  const historyResult = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { role: { in: ['user', 'assistant'] } },
        { deletedAt: { exists: false } },
        { isRegenerated: { not_equals: true } },
      ],
    },
    // Most-recent 30, newest-first — see chat/route.ts. Ascending 'createdAt'
    // + limit returns the oldest 30, starving regeneration of recent context.
    sort: '-createdAt',
    limit: 30,
    // Prompt building only needs role + content — skip relationship hydration
    // (see the matching note in chat/route.ts).
    depth: 0,
    select: { role: true, content: true, createdAt: true },
  })

  const snapshot = conversation.characterSnapshot as { systemPrompt?: string } | null
  const openrouterMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  openrouterMessages.push({ role: 'system', content: snapshot?.systemPrompt ?? '' })

  // Same per-turn output guard as chat/route.ts — keep the regenerated reply in
  // the user's language and fully in character. Regeneration has no per-request
  // locale, so detect from the most recent user message (docs are newest-first),
  // falling back to the conversation language when it can't be detected.
  const lastUserContent = historyResult.docs.find((d) => d.role === 'user')?.content as
    | string
    | undefined
  openrouterMessages.push({
    role: 'system',
    content: buildOutputGuard(
      resolveReplyLocale(lastUserContent, conversation.language as string | null | undefined),
    ),
  })

  // Same per-turn tone guard as chat/route.ts — a regenerated reply must obey
  // the same warmth floor and flirt-reciprocation rules as the original.
  openrouterMessages.push({ role: 'system', content: buildStyleGuard() })

  // Same relationship-progression block as chat/route.ts (no away-gap line —
  // regeneration happens immediately after a reply, so there is no absence).
  const snapshotBackstory = (
    conversation.characterSnapshot as {
      backstory?: { relationshipStage?: string; startingRelationship?: string } | null
    } | null
  )?.backstory
  openrouterMessages.push({
    role: 'system',
    content: buildRelationshipBlock(
      resolveRelationshipStage(
        (conversation.relationshipScore as number | null) ?? 0,
        snapshotBackstory?.relationshipStage ?? snapshotBackstory?.startingRelationship ?? null,
      ),
    ),
  })

  if (conversation.summary) {
    openrouterMessages.push({
      role: 'system',
      content: `Earlier conversation summary: ${conversation.summary}`,
    })
  }

  // Same char-budget walk as chat/route.ts — newest backwards until budget,
  // reverse for chronological order. Drop the just-inserted streaming placeholder.
  // Restore chronological (oldest → newest) order after the newest-first fetch.
  const historyDocs = historyResult.docs.slice().reverse()
  const tailMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let usedChars = 0
  for (let i = historyDocs.length - 1; i >= 0; i--) {
    const msg = historyDocs[i]!
    if (msg.role !== 'user' && msg.role !== 'assistant') continue
    if (String(msg.id) === newMsgId) continue
    const content = (msg.content as string | undefined) ?? ''
    if (usedChars + content.length > HISTORY_CHAR_BUDGET) break
    tailMessages.push({ role: msg.role, content })
    usedChars += content.length
  }
  tailMessages.reverse()
  for (const m of tailMessages) openrouterMessages.push(m)

  const abortController = new AbortController()
  req.signal.addEventListener('abort', () => abortController.abort())

  const stream = new ReadableStream({
    async start(controller) {
      const enc = (s: string) => new TextEncoder().encode(s)
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc(sseEvent(event, data)))
      }

      send('message', { messageId: newMsgId })

      let accumulatedContent = ''
      // Keeps planning commentary and bracketed stage directions out of the
      // live bubble; `sanitizeReplyText` below is the authoritative pass.
      const replyFilter = makeReplyStreamFilter()
      let streamedText = ''
      let usageData: { prompt_tokens: number; completion_tokens: number } | undefined
      const startTime = Date.now()
      let timeToFirstToken: number | null = null

      try {
        const generator = streamChatCompletion({
          model: OPENROUTER_MODEL,
          messages: openrouterMessages,
          temperature: LLM_TEMPERATURE,
          maxTokens: LLM_MAX_TOKENS,
          signal: abortController.signal,
        })

        for await (const chunk of generator) {
          if (chunk.usage) usageData = chunk.usage
          if (!chunk.delta) continue
          if (timeToFirstToken === null) timeToFirstToken = Date.now() - startTime
          accumulatedContent += chunk.delta
          const shown = replyFilter.push(chunk.delta)
          if (shown) {
            streamedText += shown
            send('delta', { text: shown })
          }
        }

        const tail = replyFilter.flush()
        if (tail) {
          streamedText += tail
          send('delta', { text: tail })
        }

        const latencyMs = Date.now() - startTime

        // Output safety filter (post-LLM) — same backstop as chat/route.ts.
        const convCharacterId =
          typeof conversation.characterId === 'object' && conversation.characterId !== null
            ? (conversation.characterId as { id: string | number }).id
            : conversation.characterId
        // Regeneration doesn't offer the photo capability, but strip any stray
        // [SEND_PHOTO] marker defensively so it can never reach the user.
        // Strip the [SEND_PHOTO] marker, planning commentary, bracketed stage
        // directions and *...* action narration (the last three backstop the
        // plain-dialogue rules for frozen snapshots).
        let finalContent = sanitizeReplyText(parsePhotoDirective(accumulatedContent).cleaned)
        if (finalContent !== streamedText) {
          send('replace', { text: finalContent })
        }
        const outputVerdict = await checkAssistantOutput({
          payload,
          userId: user.id,
          text: finalContent,
          locale: (conversation.language as string | null | undefined) ?? 'en',
          relatedMessageId: newMsgId,
          relatedCharacterId: convCharacterId,
        })
        if (!outputVerdict.safe) {
          finalContent = outputVerdict.replacement
          send('replace', { text: finalContent })
        }

        await payload.update({
          collection: 'messages',
          id: newMsgId,
          data: {
            content: finalContent,
            status: 'completed',
            completedAt: new Date().toISOString(),
            generationMetadata: {
              model: OPENROUTER_MODEL,
              provider: 'openrouter',
              tokensInput: usageData?.prompt_tokens ?? null,
              tokensOutput: usageData?.completion_tokens ?? null,
              temperature: LLM_TEMPERATURE,
              latencyMs,
              timeToFirstTokenMs: timeToFirstToken,
              ...(outputVerdict.safe ? {} : { outputFiltered: true }),
            },
          },
        })

        await payload.update({
          collection: 'conversations',
          id: conversationId,
          data: {
            lastMessageAt: new Date().toISOString(),
            lastMessagePreview: finalContent.slice(0, 120),
          },
        })

        send('done', { finishReason: 'stop' })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        const isAbort = abortController.signal.aborted

        await payload.update({
          collection: 'messages',
          id: newMsgId,
          data: {
            content: accumulatedContent,
            status: isAbort && accumulatedContent ? 'completed' : 'failed',
            errorReason: isAbort ? 'client_disconnected' : errorMsg,
            completedAt: new Date().toISOString(),
          },
        }).catch(() => {})

        if (!isAbort) {
          send('error', { message: 'Regeneration failed. Please try again.' })
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
