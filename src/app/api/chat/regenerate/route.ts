// Text regeneration is free per spec 3.8 — no quota / token deduction
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { z } from 'zod'
import { getCurrentUser } from '@/shared/auth/current-user'
import { streamChatCompletion, OPENROUTER_MODEL } from '@/shared/ai/openrouter'

const LLM_TEMPERATURE = 1.3
const LLM_MAX_TOKENS = 600

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

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { conversationId, messageId } = parsed.data
  const payload = await getPayload({ config })

  const conversation = await payload.findByID({ collection: 'conversations', id: conversationId })
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

  const oldMessage = await payload.findByID({ collection: 'messages', id: messageId })
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
  })
  const newMsgId = String(newAssistantMsg.id)

  const historyResult = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { role: { in: ['user', 'assistant'] } },
        { deletedAt: { equals: null } },
        { isRegenerated: { not_equals: true } },
      ],
    },
    sort: 'createdAt',
    limit: 30,
  })

  const snapshot = conversation.characterSnapshot as { systemPrompt?: string } | null
  const openrouterMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  openrouterMessages.push({ role: 'system', content: snapshot?.systemPrompt ?? '' })

  if (conversation.summary) {
    openrouterMessages.push({
      role: 'system',
      content: `Earlier conversation summary: ${conversation.summary}`,
    })
  }

  for (const msg of historyResult.docs) {
    if (
      (msg.role === 'user' || msg.role === 'assistant') &&
      String(msg.id) !== newMsgId
    ) {
      openrouterMessages.push({ role: msg.role, content: msg.content ?? '' })
    }
  }

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
          send('delta', { text: chunk.delta })
        }

        const latencyMs = Date.now() - startTime

        await payload.update({
          collection: 'messages',
          id: newMsgId,
          data: {
            content: accumulatedContent,
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
            },
          },
        })

        await payload.update({
          collection: 'conversations',
          id: conversationId,
          data: {
            lastMessageAt: new Date().toISOString(),
            lastMessagePreview: accumulatedContent.slice(0, 120),
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
