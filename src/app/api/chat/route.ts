// TODO(phase-3-safety): add input/output safety filters before/after LLM call

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
import { generateImage } from '@/shared/ai/fal'
import { persistGeneratedImage } from '@/features/media/persist-generated-image'
import { autoRefund, getBalance, spend } from '@/features/tokens/ledger'
import { classifyImageSafety } from '@/shared/ai/safety'
import { isPremiumPlan } from '@/features/billing/plans'

const LLM_MODEL = OPENROUTER_MODEL
const LLM_TEMPERATURE = 1.3
const LLM_MAX_TOKENS = 600

const IMAGE_TOKEN_COST = 2

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

function lastMessagePreviewForLocale(locale: string): string {
  if (locale === 'ru') return '[фото]'
  if (locale === 'es') return '[foto]'
  return '[image]'
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

  await payload.create({
    collection: 'messages',
    data: {
      conversationId: conversationId,
      role: 'user',
      type: 'text',
      status: 'completed',
      content: message,
    },
  })

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
  const isImageRequest = detectImageIntent(message, convLanguage)

  // ---------------------------------------------------------------------------
  // IMAGE path
  // ---------------------------------------------------------------------------
  if (isImageRequest) {
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
        const refundSafetyKey = `image:refund:safety:${assistantImageMsgId}`

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

        // 5. Generate. On failure, refund the reservation (tech_refund) and
        //    surface a generic error to the user — they should not pay for
        //    our provider hiccups.
        let imageResult: Awaited<ReturnType<typeof generateImage>>
        const imageStart = Date.now()

        try {
          imageResult = await generateImage({
            prompt,
            negativePrompt,
            imageSize: 'portrait_4_3',
          })
        } catch (genErr) {
          const errMsg = genErr instanceof Error ? genErr.message : 'Image generation failed'
          log.error({ msg: 'chat.image.gen_failed', conversationId, err: errMsg })

          await autoRefund(payload, {
            userId: user.id,
            type: 'tech_refund',
            amount: IMAGE_TOKEN_COST,
            reason: `image_gen_failed: ${errMsg}`.slice(0, 240),
            relatedMessageId: assistantImageMsgId,
            idempotencyKey: refundTechKey,
          })

          await payload.update({
            collection: 'messages',
            id: assistantImageMsgId,
            data: { status: 'failed', errorReason: errMsg, completedAt: new Date().toISOString() },
          })
          send('error', { message: imageFailedMessageForLocale(convLanguage) })
          controller.close()
          return
        }

        const latencyMs = Date.now() - imageStart
        const firstImage = imageResult.images[0]!

        // 6. Persist to R2. Same refund policy as gen failure.
        let persistResult: Awaited<ReturnType<typeof persistGeneratedImage>>
        try {
          persistResult = await persistGeneratedImage({
            payload,
            fromUrl: firstImage.url,
            width: firstImage.width,
            height: firstImage.height,
            contentType: firstImage.contentType,
            kind: 'message-image',
            ownerUserId: user.id,
            relatedMessageId: assistantImageMsgId,
          })
        } catch (persistErr) {
          const errMsg = persistErr instanceof Error ? persistErr.message : 'Persist failed'
          log.error({ msg: 'chat.image.persist_failed', conversationId, err: errMsg })

          await autoRefund(payload, {
            userId: user.id,
            type: 'tech_refund',
            amount: IMAGE_TOKEN_COST,
            reason: `image_persist_failed: ${errMsg}`.slice(0, 240),
            relatedMessageId: assistantImageMsgId,
            idempotencyKey: refundTechKey,
          })

          await payload.update({
            collection: 'messages',
            id: assistantImageMsgId,
            data: { status: 'failed', errorReason: errMsg, completedAt: new Date().toISOString() },
          })
          send('error', { message: imageFailedMessageForLocale(convLanguage) })
          controller.close()
          return
        }

        // 7. Safety classifier (stub for now). On flag: soft-delete the asset,
        //    refund the user (safety_refund — separate from tech for metrics),
        //    and surface a generic refusal so we don't leak classifier internals.
        const verdict = await classifyImageSafety({
          imageUrl: persistResult.publicUrl,
          width: firstImage.width,
          height: firstImage.height,
        })

        if (verdict.flagged) {
          log.warn({
            msg: 'chat.image.safety_flagged',
            conversationId,
            mediaAssetId: persistResult.mediaAssetId,
            reason: verdict.reason,
          })

          await payload.update({
            collection: 'media-assets',
            id: String(persistResult.mediaAssetId),
            data: { deletedAt: new Date().toISOString() },
          }).catch(() => {})

          await autoRefund(payload, {
            userId: user.id,
            type: 'safety_refund',
            amount: IMAGE_TOKEN_COST,
            reason: `safety_flagged: ${verdict.reason}`.slice(0, 240),
            relatedMessageId: assistantImageMsgId,
            idempotencyKey: refundSafetyKey,
          })

          await payload.update({
            collection: 'messages',
            id: assistantImageMsgId,
            data: { status: 'failed', errorReason: 'safety_flagged', completedAt: new Date().toISOString() },
          })
          send('error', { message: imageFailedMessageForLocale(convLanguage) })
          controller.close()
          return
        }

        await payload.update({
          collection: 'messages',
          id: assistantImageMsgId,
          data: {
            imageAssetId: persistResult.mediaAssetId as string,
            status: 'completed',
            completedAt: new Date().toISOString(),
            userTokensSpent: IMAGE_TOKEN_COST,
            spendType: 'image',
            generationMetadata: {
              model: imageResult.modelName,
              endpoint: imageResult.endpoint,
              requestId: imageResult.requestId,
              seed: imageResult.seed,
              prompt,
              negativePrompt,
              latencyMs,
            },
          },
        })

        // Update conversation + recompute relationship score
        const currentCount = (conversation.messageCount as number | null) ?? 0
        const currentDaysActive = (conversation.daysActiveCount as number | null) ?? 0
        const newDaysActive = currentDaysActive + (isNewActiveDay(conversation.lastMessageAt as string | null) ? 1 : 0)
        const newMessageCount = currentCount + 2
        const now = new Date().toISOString()
        const newScore = computeRelationshipScore({
          messageCount: newMessageCount,
          daysActiveCount: newDaysActive,
          lastMessageAt: now,
        })
        await payload.update({
          collection: 'conversations',
          id: conversationId,
          data: {
            messageCount: newMessageCount,
            daysActiveCount: newDaysActive,
            lastMessageAt: now,
            lastMessagePreview: lastMessagePreviewForLocale(convLanguage),
            relationshipScore: newScore,
          },
        })

        // 6. Stream image event
        send('image', {
          mediaAssetId: persistResult.mediaAssetId,
          url: persistResult.publicUrl,
          width: firstImage.width,
          height: firstImage.height,
        })
        send('done', { finishReason: 'image_generated' })

        // 7. PostHog
        track({
          userId: String(user.id),
          event: 'chat.image_generated',
          properties: {
            model: imageResult.modelName,
            seed: imageResult.seed,
            latencyMs,
            requestId: imageResult.requestId,
            characterId: typeof conversation.characterId === 'object'
              ? (conversation.characterId as { id: string | number }).id
              : conversation.characterId,
            tokensSpent: IMAGE_TOKEN_COST,
          },
        })

        log.info({ msg: 'chat.image.done', conversationId, latencyMs: Date.now() - handlerStart })
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

  const historyResult = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { role: { in: ['user', 'assistant'] } },
        { deletedAt: { equals: null } },
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

  for (const msg of historyResult.docs) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      openrouterMessages.push({ role: msg.role, content: msg.content ?? '' })
    }
  }

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
