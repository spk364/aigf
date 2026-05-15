// Layer 3 (input safety filter) is wired in below — runs after the user
// message is persisted, before any LLM call. Layer 5 (output safety filter)
// is still TODO — see `scoreAssistantOutput` follow-up.

export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { z } from 'zod'
import { getCurrentUser } from '@/shared/auth/current-user'
import { streamChatCompletion, OPENROUTER_MODEL } from '@/shared/ai/openrouter'
import { getDailyMessageCap, checkAndIncrementQuota } from '@/features/quota/message-quota'
import { getRequestContext } from '@/shared/lib/request-context'
import { createLogger } from '@/shared/lib/logger'
import { track } from '@/shared/analytics/posthog'
import { detectImageIntent } from '@/features/chat/intent-detection'
import { buildImagePrompt, type CharacterAppearance } from '@/features/chat/image-prompt'
import { computeRelationshipScore, isNewActiveDay } from '@/features/chat/relationship-score'
import { retrieveMemories, formatMemoriesForPrompt } from '@/features/memory/retrieve-memories'
import { extractMemories } from '@/features/memory/extract-memories'
import { getBalance, spend } from '@/features/tokens/ledger'
import { isPremiumPlan } from '@/features/billing/plans'
import { checkRateLimit, rateLimitHeaders, rateLimitResponseBody } from '@/shared/rate-limit/limiter'
import { CHAT_LIMIT, IMAGE_GEN_LIMIT } from '@/shared/rate-limit/presets'
import { submitChatImageJob, IMAGE_TOKEN_COST } from '@/features/chat/image-job'
import { scoreUserInput } from '@/shared/safety/input-filter'
import { logSafetyIncident } from '@/features/safety/log-incident'
import { getInputRefusalMessage } from '@/features/safety/refusal-messages'

const LLM_MODEL = OPENROUTER_MODEL
// DeepSeek-V3 vendor guidance: 0.6–1.0 for chat / roleplay. We were running 1.3,
// which pushes the sampler into the low-probability tail and produces
// hallucinated biographical facts and broken character consistency. 0.85 keeps
// personality alive without inventing.
const LLM_TEMPERATURE = 0.85
// Output cap: most observed responses land at 200–350 tokens. 400 leaves room
// for occasional longer replies without paying for runaway 600-token output
// completions. See docs/payments-tokenomics-plan.md §2.3 HOLE-8.
const LLM_MAX_TOKENS = 400

// Soft cap on the recent-history block. At ~4 chars/token DeepSeek-V3 sees
// ~3.5k input tokens of history before system prompt + memory + summary stack
// on top. Stops a string of 2000-char user messages from ballooning context
// to 60k chars (~$0.02/turn vs the budgeted ~$0.002).
const HISTORY_CHAR_BUDGET = 14_000

// IDs come over the wire as strings (JSON body) or numbers (Postgres int ids).
// Accept both and coerce to number when possible — the relationship fields in
// integer-id Postgres collections reject string ids.
const idSchema = z.union([z.string(), z.number()]).transform((v) => {
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) && /^\d+$/.test(v) ? n : v
})

const bodySchema = z.object({
  conversationId: idSchema.optional(),
  characterId: idSchema.optional(),
  message: z.string().min(1).max(2000),
  locale: z.enum(['en', 'ru', 'es']).default('en'),
})

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function upgradeMessageForLocale(locale: string, upgradeUrl: string): string {
  if (locale === 'ru') {
    return `Фотографии доступны только на Premium-плане. [Улучшить](${upgradeUrl})`
  }
  if (locale === 'es') {
    return `Las fotos son una funcion Premium. [Mejorar](${upgradeUrl})`
  }
  return `Photos are a Premium feature. [Upgrade](${upgradeUrl})`
}

function tokensRequiredMessageForLocale(locale: string, upgradeUrl: string): string {
  if (locale === 'ru') {
    return `У тебя закончились токены в этом месяце. [Пополнить или улучшить план](${upgradeUrl})`
  }
  if (locale === 'es') {
    return `Te has quedado sin tokens este mes. [Recargar o mejorar](${upgradeUrl})`
  }
  return `You've run out of tokens this month. [Upgrade or buy more](${upgradeUrl})`
}

function imageFailedMessageForLocale(locale: string): string {
  if (locale === 'ru') return 'Не удалось создать фото. Попробуй ещё раз.'
  if (locale === 'es') return 'No se pudo generar la foto. Intentalo de nuevo.'
  return 'Failed to generate image. Please try again.'
}

export async function POST(req: NextRequest) {
  const { requestId } = getRequestContext(req.headers)
  const handlerStart = Date.now()

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = createLogger({ requestId, userId: String(user.id) })
  log.info({ msg: 'chat.request.start' })

  const rl = await checkRateLimit(CHAT_LIMIT, `u:${user.id}`)
  if (!rl.allowed) {
    log.warn({ msg: 'chat.rate_limited', blockedBy: rl.blockedBy, retryAfterSeconds: rl.retryAfterSeconds })
    track({
      userId: String(user.id),
      event: 'chat.rate_limited',
      properties: { blockedBy: rl.blockedBy, retryAfterSeconds: rl.retryAfterSeconds },
    })
    return NextResponse.json(rateLimitResponseBody(rl), {
      status: 429,
      headers: rateLimitHeaders(rl),
    })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { conversationId: incomingConversationId, characterId, message, locale } = parsed.data

  const payload = await getPayload({ config })

  const cap = await getDailyMessageCap(payload, user)
  const quota = await checkAndIncrementQuota(user.id, cap)
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'quota_exceeded', resetAt: quota.resetAt, cap: quota.cap, used: quota.used },
      { status: 429 },
    )
  }
  // TODO(phase-2-task-5): consider refunding quota on LLM error (currently one "try" per count per spec)

  let conversationId: string | number | undefined = incomingConversationId
  let isNewConversation = false

  if (!conversationId) {
    if (!characterId) {
      return NextResponse.json({ error: 'characterId required when no conversationId' }, { status: 400 })
    }

    const character = await payload.findByID({ collection: 'characters', id: characterId, locale })
    if (!character || character.deletedAt) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const conversation = await payload.create({
      collection: 'conversations',
      data: {
        userId: user.id,
        characterId: character.id,
        characterSnapshot: {
          systemPrompt: character.systemPrompt,
          name: character.name,
          personalityTraits: character.personalityTraits,
          backstory: character.backstory,
          appearance: character.appearance ?? null,
          imageModel: character.imageModel ?? null,
        },
        snapshotVersion: character.systemPromptVersion ?? 1,
        llmConfig: {
          provider: 'openrouter',
          model: LLM_MODEL,
          tier: 'standard',
          temperature: LLM_TEMPERATURE,
          maxTokens: LLM_MAX_TOKENS,
          snapshotAt: new Date().toISOString(),
        },
        language: locale,
        status: 'active',
      },
    })

    // Postgres collections use integer ids — keep the original numeric/string id
    // returned by Payload, do NOT coerce to String. Relationship fields in v3
    // reject string ids on integer-id collections with a ValidationError.
    conversationId = conversation.id
    isNewConversation = true
  }

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

  const userMessage = await payload.create({
    collection: 'messages',
    data: {
      conversationId: conversationId,
      role: 'user',
      type: 'text',
      status: 'completed',
      content: message,
    },
  })
  const userMessageId = userMessage.id

  // Track chat message sent (no content — only metadata)
  const conversationLengthBefore = (conversation.messageCount as number | null) ?? 0
  const isFirstMessageInConversation = isNewConversation || conversationLengthBefore === 0

  track({
    userId: String(user.id),
    event: 'chat.message_sent',
    properties: {
      characterId: characterId ?? (typeof conversation.characterId === 'object' ? (conversation.characterId as { id: string | number }).id : conversation.characterId),
      conversationLengthBefore,
      isFirstMessageInConversation,
    },
  })

  if (isFirstMessageInConversation) {
    track({
      userId: String(user.id),
      event: 'chat.first_message',
      properties: {
        characterId: characterId ?? (typeof conversation.characterId === 'object' ? (conversation.characterId as { id: string | number }).id : conversation.characterId),
      },
    })
  }

  log.info({ msg: 'chat.message.user_saved', conversationId, isNewConversation })

  const convLanguage = (conversation.language as string | null | undefined) ?? 'en'

  // ---------------------------------------------------------------------------
  // Layer 3: Input safety filter (pre-LLM)
  // ---------------------------------------------------------------------------
  // Runs after the user message is persisted so the conversation thread shows
  // what was attempted (status='flagged'), but before any LLM/image call so
  // no offending content reaches a generator. Both the image path and the
  // text path are gated by this — we short-circuit with a refusal stream.
  const safetyVerdict = scoreUserInput(message, { locale: convLanguage })
  if (!safetyVerdict.ok) {
    const convCharacterIdForIncident =
      typeof conversation.characterId === 'object' && conversation.characterId !== null
        ? (conversation.characterId as { id: string | number }).id
        : conversation.characterId

    log.warn({
      msg: 'chat.safety.input_blocked',
      conversationId,
      severity: safetyVerdict.severity,
      category: safetyVerdict.category,
      matchedCount: safetyVerdict.matched.length,
    })

    // Mark the user turn so the UI can render it as blocked and so future
    // history queries can skip it before sending to the LLM.
    await payload.update({
      collection: 'messages',
      id: userMessageId,
      data: {
        status: 'flagged',
        safetyFlags: {
          layer: 'input',
          severity: safetyVerdict.severity,
          category: safetyVerdict.category,
          matched: safetyVerdict.matched,
          sexualContext: safetyVerdict.sexualContext,
          ...(safetyVerdict.adultnessScore !== undefined
            ? { adultnessScore: safetyVerdict.adultnessScore }
            : {}),
        },
      },
    }).catch((err: unknown) => {
      log.error({ msg: 'chat.safety.flag_user_msg_failed', err: err instanceof Error ? err.message : err })
    })

    const refusalText = getInputRefusalMessage(convLanguage, safetyVerdict.severity)

    // Save the refusal with status='flagged' as well — same semantics: the
    // history fetcher uses `status != 'flagged'` to exclude both sides of a
    // safety-blocked exchange from the LLM context. The UI loader doesn't
    // filter on status, so the user still sees the refusal in their thread.
    const refusalMsg = await payload.create({
      collection: 'messages',
      data: {
        conversationId: conversationId,
        role: 'assistant',
        type: 'text',
        status: 'flagged',
        content: refusalText,
        safetyFlags: {
          layer: 'input',
          refusal: true,
          severity: safetyVerdict.severity,
          category: safetyVerdict.category,
        },
        completedAt: new Date().toISOString(),
      },
    })
    const refusalMsgId = String(refusalMsg.id)

    // Best-effort incident log. Same shape that Layers 5/6/7 will reuse.
    await logSafetyIncident({
      payload,
      userId: user.id,
      conversationId,
      messageId: userMessageId,
      ...(convCharacterIdForIncident !== undefined && convCharacterIdForIncident !== null
        ? { characterId: convCharacterIdForIncident as string | number }
        : {}),
      layer: 'input',
      severity: safetyVerdict.severity,
      category: safetyVerdict.category,
      matched: safetyVerdict.matched,
      inputSnippet: message,
      locale: convLanguage,
      ...(req.headers.get('x-forwarded-for')
        ? { ipAddress: req.headers.get('x-forwarded-for')!.split(',')[0]!.trim() }
        : {}),
      ...(req.headers.get('user-agent')
        ? { userAgent: req.headers.get('user-agent')! }
        : {}),
      metadata: {
        sexualContext: safetyVerdict.sexualContext,
        ...(safetyVerdict.adultnessScore !== undefined
          ? { adultnessScore: safetyVerdict.adultnessScore }
          : {}),
      },
    })

    // Update conversation aggregates so the timeline reflects the exchange,
    // matching the entitlement-denied / insufficient-tokens refusal flows.
    {
      const cnt = (conversation.messageCount as number | null) ?? 0
      const days = (conversation.daysActiveCount as number | null) ?? 0
      const newDays = days + (isNewActiveDay(conversation.lastMessageAt as string | null) ? 1 : 0)
      const newCnt = cnt + 2
      const ts = new Date().toISOString()
      await payload.update({
        collection: 'conversations',
        id: conversationId,
        data: {
          messageCount: newCnt,
          daysActiveCount: newDays,
          lastMessageAt: ts,
          lastMessagePreview: refusalText.slice(0, 120),
          relationshipScore: computeRelationshipScore({ messageCount: newCnt, daysActiveCount: newDays, lastMessageAt: ts }),
        },
      }).catch(() => {})
    }

    track({
      userId: String(user.id),
      event: 'chat.safety_blocked',
      properties: {
        layer: 'input',
        severity: safetyVerdict.severity,
        category: safetyVerdict.category,
      },
    })

    const stream = new ReadableStream({
      start(controller) {
        const enc = (s: string) => new TextEncoder().encode(s)
        const send = (event: string, data: unknown) => {
          controller.enqueue(enc(sseEvent(event, data)))
        }
        if (isNewConversation) send('conversation', { conversationId })
        send('message', { messageId: refusalMsgId })
        send('delta', { text: refusalText })
        send('done', { finishReason: 'safety_blocked' })
        controller.close()
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

  const isImageRequest = detectImageIntent(message, convLanguage)

  // ---------------------------------------------------------------------------
  // IMAGE path
  // ---------------------------------------------------------------------------
  if (isImageRequest) {
    // Image-gen has a tighter limit — each call costs real $$ at fal.ai and
    // burns user tokens. The chat-text limit above already passed; this is
    // an additional gate for the cost-sensitive sub-path.
    const imageRl = await checkRateLimit(IMAGE_GEN_LIMIT, `u:${user.id}`)
    if (!imageRl.allowed) {
      log.warn({ msg: 'chat.image.rate_limited', blockedBy: imageRl.blockedBy, retryAfterSeconds: imageRl.retryAfterSeconds })
      track({
        userId: String(user.id),
        event: 'chat.image.rate_limited',
        properties: { blockedBy: imageRl.blockedBy, retryAfterSeconds: imageRl.retryAfterSeconds },
      })
      return NextResponse.json(rateLimitResponseBody(imageRl, 'Too many image requests'), {
        status: 429,
        headers: rateLimitHeaders(imageRl),
      })
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = (s: string) => new TextEncoder().encode(s)
        const send = (event: string, data: unknown) => {
          controller.enqueue(enc(sseEvent(event, data)))
        }

        if (isNewConversation) {
          send('conversation', { conversationId })
        }

        const upgradeUrl = `/${convLanguage}/upgrade`

        // 1. Check subscription entitlement
        const subResult = await payload.find({
          collection: 'subscriptions',
          where: {
            and: [
              { userId: { equals: user.id } },
              { status: { equals: 'active' } },
            ],
          },
          limit: 1,
          overrideAccess: true,
        })

        const activeSub = subResult.docs[0]
        const isPremium = !!activeSub && isPremiumPlan(activeSub.plan as string | null)

        if (!isPremium) {
          const upgradeMsg = upgradeMessageForLocale(convLanguage, upgradeUrl)
          const deniedMsg = await payload.create({
            collection: 'messages',
            data: {
              conversationId: conversationId,
              role: 'assistant',
              type: 'text',
              status: 'completed',
              content: upgradeMsg,
              completedAt: new Date().toISOString(),
            },
          })
          {
            const cnt = (conversation.messageCount as number | null) ?? 0
            const days = (conversation.daysActiveCount as number | null) ?? 0
            const newDays = days + (isNewActiveDay(conversation.lastMessageAt as string | null) ? 1 : 0)
            const newCnt = cnt + 2
            const ts = new Date().toISOString()
            await payload.update({
              collection: 'conversations',
              id: conversationId,
              data: {
                messageCount: newCnt,
                daysActiveCount: newDays,
                lastMessageAt: ts,
                lastMessagePreview: upgradeMsg.slice(0, 120),
                relationshipScore: computeRelationshipScore({ messageCount: newCnt, daysActiveCount: newDays, lastMessageAt: ts }),
              },
            })
          }
          send('message', { messageId: String(deniedMsg.id) })
          send('delta', { text: upgradeMsg })
          send('done', { finishReason: 'entitlement_denied' })
          controller.close()
          return
        }

        // 2. Pre-flight balance check (cheap UX hint — reserve below is the
        //    authoritative gate via atomic spend).
        const balance = await getBalance(payload, user.id)
        if (balance < IMAGE_TOKEN_COST) {
          const tokenMsg = tokensRequiredMessageForLocale(convLanguage, upgradeUrl)
          const tokenDeniedMsg = await payload.create({
            collection: 'messages',
            data: {
              conversationId: conversationId,
              role: 'assistant',
              type: 'text',
              status: 'completed',
              content: tokenMsg,
              completedAt: new Date().toISOString(),
            },
          })
          {
            const cnt = (conversation.messageCount as number | null) ?? 0
            const days = (conversation.daysActiveCount as number | null) ?? 0
            const newDays = days + (isNewActiveDay(conversation.lastMessageAt as string | null) ? 1 : 0)
            const newCnt = cnt + 2
            const ts = new Date().toISOString()
            await payload.update({
              collection: 'conversations',
              id: conversationId,
              data: {
                messageCount: newCnt,
                daysActiveCount: newDays,
                lastMessageAt: ts,
                lastMessagePreview: tokenMsg.slice(0, 120),
                relationshipScore: computeRelationshipScore({ messageCount: newCnt, daysActiveCount: newDays, lastMessageAt: ts }),
              },
            })
          }
          send('message', { messageId: String(tokenDeniedMsg.id) })
          send('delta', { text: tokenMsg })
          send('done', { finishReason: 'insufficient_tokens' })
          controller.close()
          return
        }

        // 3. Create the assistant message FIRST so we have a stable id to use
        //    as the idempotency anchor for the reserve, refund, and any retries.
        const assistantImageMsg = await payload.create({
          collection: 'messages',
          data: {
            conversationId: conversationId,
            role: 'assistant',
            type: 'image',
            status: 'pending',
          },
        })
        const assistantImageMsgId = String(assistantImageMsg.id)
        send('message', { messageId: assistantImageMsgId })

        // 4. Reserve tokens BEFORE calling fal.ai. Two concurrent requests with
        //    barely-enough balance: at most one wins; the loser short-circuits
        //    without burning provider quota. Idempotency key keyed on the
        //    message id so a retried HTTP request reuses the same reservation.
        const reserveKey = `image:reserve:${assistantImageMsgId}`
        const refundTechKey = `image:refund:tech:${assistantImageMsgId}`

        const spendResult = await spend(payload, {
          userId: user.id,
          type: 'spend_image',
          amount: IMAGE_TOKEN_COST,
          relatedMessageId: assistantImageMsgId,
          reason: 'on-request image',
          idempotencyKey: reserveKey,
        })

        if (!spendResult.ok) {
          await payload.update({
            collection: 'messages',
            id: assistantImageMsgId,
            data: {
              status: 'failed',
              errorReason: 'insufficient_tokens',
              completedAt: new Date().toISOString(),
            },
          })
          send('error', { message: tokensRequiredMessageForLocale(convLanguage, upgradeUrl) })
          controller.close()
          return
        }

        const characterSnapshot = (conversation.characterSnapshot ?? {}) as {
          name?: string
          backstory?: { occupation?: string; location?: string }
          appearance?: CharacterAppearance | null
        }

        const { prompt, negativePrompt } = buildImagePrompt({
          characterSnapshot,
          userMessage: message,
          language: convLanguage,
        })

        // 5. Submit fal job (fast — ~1s) and stash handles. The slow tail
        //    (fal poll → persist → classify → ledger) lives in the
        //    /api/chat/messages/[id]/image-status route which the client
        //    polls until terminal. This keeps us inside the 60s function cap
        //    even when fal queues the request behind a cold-start.
        const submitResult = await submitChatImageJob({
          payload,
          conversationId,
          messageId: assistantImageMsgId,
          userId: user.id,
          prompt,
          negativePrompt,
          imageSize: 'portrait_4_3',
        })

        if (!submitResult.ok) {
          log.error({ msg: 'chat.image.submit_failed', conversationId, err: submitResult.error })

          // Submit failed → refund and mark message as failed before stream closes.
          // We import autoRefund inline to keep the lazy-load shape; it's only
          // needed on this rare path.
          const { autoRefund } = await import('@/features/tokens/ledger')
          await autoRefund(payload, {
            userId: user.id,
            type: 'tech_refund',
            amount: IMAGE_TOKEN_COST,
            reason: `image_submit_failed: ${submitResult.error}`.slice(0, 240),
            relatedMessageId: assistantImageMsgId,
            idempotencyKey: refundTechKey,
          })

          await payload.update({
            collection: 'messages',
            id: assistantImageMsgId,
            data: { status: 'failed', errorReason: submitResult.error.slice(0, 240), completedAt: new Date().toISOString() },
          })
          send('error', { message: imageFailedMessageForLocale(convLanguage) })
          controller.close()
          return
        }

        // Tell the client to start polling. Final image / failure surfaces
        // through /api/chat/messages/[id]/image-status — see ChatInterface.
        send('image-pending', { messageId: assistantImageMsgId })
        send('done', { finishReason: 'image_submitted' })

        log.info({ msg: 'chat.image.submitted', conversationId, messageId: assistantImageMsgId, latencyMs: Date.now() - handlerStart })
        controller.close()
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

  // ---------------------------------------------------------------------------
  // TEXT path (unchanged)
  // ---------------------------------------------------------------------------

  // Exclude flagged turns (Layer 3 input refusals — both the user message
  // and the matching assistant refusal) from the LLM context. We never want
  // the offending text replayed, and dropping the refusal too keeps the LLM
  // unaware of the policy exchange (otherwise it tends to apologize on the
  // next reply, which derails the persona).
  const historyResult = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { role: { in: ['user', 'assistant'] } },
        { deletedAt: { exists: false } },
        { status: { not_equals: 'flagged' } },
      ],
    },
    sort: 'createdAt',
    limit: 30,
  })

  const snapshot = conversation.characterSnapshot as {
    systemPrompt?: string
    name?: string
  } | null

  // Retrieve top-5 relevant memories for this (user, character) pair.
  const convCharacterId =
    typeof conversation.characterId === 'object' && conversation.characterId !== null
      ? (conversation.characterId as { id: string | number }).id
      : conversation.characterId

  const memories = await retrieveMemories({
    payload,
    userId: user.id,
    characterId: convCharacterId,
    queryText: message,
  }).catch(() => [])

  const openrouterMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  openrouterMessages.push({
    role: 'system',
    content: snapshot?.systemPrompt ?? '',
  })

  const memoryBlock = formatMemoriesForPrompt(memories)
  if (memoryBlock) {
    openrouterMessages.push({ role: 'system', content: memoryBlock })
  }

  if (conversation.summary) {
    openrouterMessages.push({
      role: 'system',
      content: `Earlier conversation summary: ${conversation.summary}`,
    })
  }

  // Walk history from newest → oldest, accumulating until the char-budget is
  // hit; then reverse so the LLM sees chronological order. Drops the oldest
  // messages on long convos rather than always passing the full 30. Summary +
  // memories above cover anything older.
  const historyDocs = historyResult.docs
  const tailMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let usedChars = 0
  for (let i = historyDocs.length - 1; i >= 0; i--) {
    const msg = historyDocs[i]!
    if (msg.role !== 'user' && msg.role !== 'assistant') continue
    const content = (msg.content as string | undefined) ?? ''
    if (usedChars + content.length > HISTORY_CHAR_BUDGET) break
    tailMessages.push({ role: msg.role, content })
    usedChars += content.length
  }
  tailMessages.reverse()
  for (const m of tailMessages) openrouterMessages.push(m)

  const assistantMsg = await payload.create({
    collection: 'messages',
    data: {
      conversationId: conversationId,
      role: 'assistant',
      type: 'text',
      status: 'streaming',
      content: '',
    },
  })
  const assistantMsgId = String(assistantMsg.id)

  const abortController = new AbortController()
  req.signal.addEventListener('abort', () => abortController.abort())

  const stream = new ReadableStream({
    async start(controller) {
      const enc = (s: string) => new TextEncoder().encode(s)

      const send = (event: string, data: unknown) => {
        controller.enqueue(enc(sseEvent(event, data)))
      }

      if (isNewConversation) {
        send('conversation', { conversationId })
      }
      send('message', { messageId: assistantMsgId })

      const thinkingDelay = 600 + Math.floor(Math.random() * 900)
      await delay(thinkingDelay)

      let accumulatedContent = ''
      let usageData: { prompt_tokens: number; completion_tokens: number } | undefined
      const startTime = Date.now()
      let timeToFirstToken: number | null = null

      try {
        const generator = streamChatCompletion({
          model: LLM_MODEL,
          messages: openrouterMessages,
          temperature: LLM_TEMPERATURE,
          maxTokens: LLM_MAX_TOKENS,
          signal: abortController.signal,
        })

        for await (const chunk of generator) {
          if (chunk.usage) usageData = chunk.usage
          if (!chunk.delta) continue

          if (timeToFirstToken === null) {
            timeToFirstToken = Date.now() - startTime
          }

          accumulatedContent += chunk.delta
          send('delta', { text: chunk.delta })
        }

        const latencyMs = Date.now() - startTime

        await payload.update({
          collection: 'messages',
          id: assistantMsgId,
          data: {
            content: accumulatedContent,
            status: 'completed',
            completedAt: new Date().toISOString(),
            generationMetadata: {
              model: LLM_MODEL,
              provider: 'openrouter',
              tokensInput: usageData?.prompt_tokens ?? null,
              tokensOutput: usageData?.completion_tokens ?? null,
              temperature: LLM_TEMPERATURE,
              latencyMs,
              timeToFirstTokenMs: timeToFirstToken,
            },
          },
        })

        const cnt = (conversation.messageCount as number | null) ?? 0
        const days = (conversation.daysActiveCount as number | null) ?? 0
        const newDays = days + (isNewActiveDay(conversation.lastMessageAt as string | null) ? 1 : 0)
        const newCnt = cnt + 2
        const ts = new Date().toISOString()
        await payload.update({
          collection: 'conversations',
          id: conversationId,
          data: {
            messageCount: newCnt,
            daysActiveCount: newDays,
            lastMessageAt: ts,
            lastMessagePreview: accumulatedContent.slice(0, 120),
            relationshipScore: computeRelationshipScore({ messageCount: newCnt, daysActiveCount: newDays, lastMessageAt: ts }),
          },
        })

        log.info({
          msg: 'chat.request.done',
          conversationId,
          latencyMs: Date.now() - handlerStart,
        })

        // Trigger memory extraction every 30 user messages (fire-and-forget).
        // The check uses newCnt (total messages, user+assistant = pairs of 2).
        // newCnt / 2 = user messages count.
        if (newCnt > 0 && (newCnt / 2) % 30 === 0) {
          const extractionMessages = historyResult.docs
            .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
            .map((m) => ({ role: m.role as string, content: m.content ?? '', id: m.id }))

          // Add the current user message and the just-generated assistant message.
          extractionMessages.push({ role: 'user', content: message, id: 'current-user' })
          extractionMessages.push({ role: 'assistant', content: accumulatedContent, id: assistantMsgId })

          void extractMemories({
            payload,
            userId: user.id,
            characterId: convCharacterId,
            conversationId,
            messages: extractionMessages,
          }).catch((err: unknown) => {
            log.warn({ msg: 'memory.extraction.background_failed', conversationId, err: err instanceof Error ? err.message : err })
          })
        }

        send('done', { finishReason: 'stop' })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        const isAbort =
          errorMsg.includes('abort') || errorMsg.includes('AbortError') || abortController.signal.aborted

        if (!isAbort) {
          log.error({ msg: 'chat.request.error', conversationId, err: errorMsg })
        }

        await payload.update({
          collection: 'messages',
          id: assistantMsgId,
          data: {
            content: accumulatedContent,
            status: isAbort && accumulatedContent ? 'completed' : 'failed',
            errorReason: isAbort ? 'client_disconnected' : errorMsg,
            completedAt: new Date().toISOString(),
          },
        }).catch(() => {})

        if (!isAbort) {
          send('error', { message: 'Generation failed. Please try again.' })
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
