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
import { findExistingConversation } from '@/features/chat/find-existing-conversation'
import {
  makeDirectiveStreamFilter,
  photoCapabilityInstructions,
  explicitPhotoRequestInstruction,
} from '@/features/chat/photo-directive'
import { type CharacterAppearance } from '@/features/chat/image-prompt'
import { buildCharacterScenePrompt, buildCharacterEditPrompt } from '@/features/chat/scene-prompt'
import { classifyShot, shotImageSize } from '@/features/chat/shot-framing'
import { sceneFromPhotoRequest } from '@/features/chat/photo-options'
import {
  isExplicitPhotoScene,
  looksLikePhotoRefusal,
  photoSendCaption,
  resolveExplicitScene,
} from '@/features/chat/photo-consistency'
import { pickModelIdForStyle } from '@/features/builder/prompt-builder'
import { findImageModel } from '@/shared/ai/image-models'
import { computeRelationshipScore, isNewActiveDay } from '@/features/chat/relationship-score'
import { retrieveMemories, formatMemoriesForPrompt } from '@/features/memory/retrieve-memories'
import { extractMemories } from '@/features/memory/extract-memories'
import { getBalance, spend } from '@/features/tokens/ledger'
import { checkRateLimit, rateLimitHeaders, rateLimitResponseBody } from '@/shared/rate-limit/limiter'
import { CHAT_LIMIT, IMAGE_GEN_LIMIT } from '@/shared/rate-limit/presets'
import { submitChatImageJob, IMAGE_TOKEN_COST } from '@/features/chat/image-job'
import { checkUserInput } from '@/features/safety/input-filter'
import { checkAssistantOutput } from '@/features/safety/output-filter'
import { getAccountState } from '@/shared/auth/account-status'

const LLM_MODEL = OPENROUTER_MODEL
// Atlas WAN 2.6 image-edit — reference-conditioned generation used for chat
// photos when the character has a reference/primary image, so the face and
// tattoos stay consistent across photos. submitChatImageJob passes the source
// image when referenceImageUrl is set.
const ATLAS_IMAGE_EDIT_MODEL_ID = 'alibaba/wan-2.6/image-edit'
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

// Photos cost tokens. We resolve eligibility BEFORE generating the reply so we
// only ever offer the photo capability to users who can actually pay — the
// character never promises a photo it can't deliver, and an unaffordable
// explicit request goes straight to a token top-up nudge. No Premium gate:
// anyone with enough tokens can receive photos. The atomic `spend` reserve at
// submit time remains the authoritative, race-safe gate.
type PhotoEligibility = {
  balance: number
  eligible: boolean
  /** Why a photo can't be sent, when not eligible. */
  blockedReason: 'tokens' | null
}

async function resolvePhotoEligibility(
  payload: Awaited<ReturnType<typeof getPayload>>,
  userId: string | number,
): Promise<PhotoEligibility> {
  const balance = await getBalance(payload, userId)
  if (balance < IMAGE_TOKEN_COST) {
    return { balance, eligible: false, blockedReason: 'tokens' }
  }
  return { balance, eligible: true, blockedReason: null }
}

export async function POST(req: NextRequest) {
  const { requestId } = getRequestContext(req.headers)
  const handlerStart = Date.now()

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Enforce safety escalation: a suspended/banned user can't chat. Without this
  // the status writes in escalation.ts would have no effect.
  const access = getAccountState(user)
  if (access.blocked) {
    return NextResponse.json(
      { error: `account_${access.reason}`, until: access.until },
      { status: 403 },
    )
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

  // ── Input safety filter (pre-LLM) ──────────────────────────────────────────
  // Runs before quota so a blocked attempt doesn't consume the user's daily
  // allowance (abuse is bounded by escalation, not quota) and before persisting
  // anything — offending input is never written to the DB. Records a flag +
  // incident and may suspend/ban via escalation.
  const inputVerdict = await checkUserInput({
    payload,
    userId: user.id,
    text: message,
    locale,
    relatedCharacterId: characterId ?? null,
    source: 'web',
  })
  if (!inputVerdict.allowed) {
    log.warn({ msg: 'chat.input_blocked', kind: inputVerdict.kind, escalation: inputVerdict.escalation })
    track({
      userId: String(user.id),
      event: 'safety.input_blocked',
      properties: { kind: inputVerdict.kind, escalation: inputVerdict.escalation },
    })
    const refusal = inputVerdict.userMessage
    const blockStream = new ReadableStream({
      start(controller) {
        const enc = (s: string) => new TextEncoder().encode(s)
        controller.enqueue(enc(sseEvent('delta', { text: refusal })))
        controller.enqueue(enc(sseEvent('done', { finishReason: 'safety_blocked' })))
        controller.close()
      },
    })
    return new Response(blockStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

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

    // One thread per (user, character). Reuse the existing conversation if there
    // is one so a first message posted without a conversationId joins the
    // unified thread instead of forking a duplicate. The /chat/new page already
    // redirects to the existing thread; this is the API-level safety net.
    const existing = await findExistingConversation(payload, user.id, character.id)
    if (existing) {
      conversationId = existing.id
    } else {
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
  const explicitPhotoRequest = detectImageIntent(message, convLanguage)

  // ---------------------------------------------------------------------------
  // Unified text + photo path
  //
  // The character's own reply decides whether to send a photo, via an inline
  // [SEND_PHOTO] directive (see features/chat/photo-directive). We stream the
  // text with the directive stripped live and, on completion, fire the fal
  // image pipeline alongside the committed text — so the character answers
  // naturally AND sends the photo in the same turn. `explicitPhotoRequest`
  // (the old regex) is kept only to *force* the directive when the user
  // clearly asks, so explicit requests are always honoured.
  // ---------------------------------------------------------------------------

  // Resolve photo affordability up front (token balance only — no Premium gate).
  // We only teach the model the [SEND_PHOTO] directive when the user has enough
  // tokens, so it never promises a photo we can't deliver. An explicit request
  // with too few tokens is turned into a top-up nudge at the end of the stream.
  const photoEligibility = await resolvePhotoEligibility(payload, user.id)
  const photoBlockedReason =
    explicitPhotoRequest && !photoEligibility.eligible ? photoEligibility.blockedReason : null

  const historyResult = await payload.find({
    collection: 'messages',
    where: {
      and: [
        { conversationId: { equals: conversationId } },
        { role: { in: ['user', 'assistant'] } },
        { deletedAt: { exists: false } },
      ],
    },
    // Most-recent 30, newest-first. Plain 'createdAt' is ascending in Payload,
    // which paired with limit:30 returns the OLDEST 30 — so on conversations
    // longer than 30 messages the LLM never saw any recent context. We reverse
    // to chronological order below for both the budget walk and extraction.
    sort: '-createdAt',
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

  // Photo-sending capability: teaches the model the [SEND_PHOTO] directive so it
  // can answer naturally AND attach a photo in the same turn. Only advertised to
  // users who have enough tokens — others never learn the marker, so they can't
  // be promised a photo.
  if (photoEligibility.eligible) {
    openrouterMessages.push({ role: 'system', content: photoCapabilityInstructions() })
  }

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
  // Restore chronological (oldest → newest) order after the newest-first fetch
  // so the budget walk below and the memory-extraction block work on a normal
  // timeline.
  const historyDocs = historyResult.docs.slice().reverse()
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

  // When an eligible user clearly asked for a photo, force the directive this
  // turn so an explicit request is never dropped (the regex booster behind the
  // old image branch). Placed last for maximum salience.
  if (explicitPhotoRequest && photoEligibility.eligible) {
    openrouterMessages.push({ role: 'system', content: explicitPhotoRequestInstruction() })
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

      // The directiveFilter accumulates the RAW model output (directive
      // included) and holds back any in-progress [SEND_PHOTO...] marker so it
      // never flashes at the user.
      const directiveFilter = makeDirectiveStreamFilter()
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

          const safe = directiveFilter.push(chunk.delta)
          if (safe) send('delta', { text: safe })
        }

        const latencyMs = Date.now() - startTime

        // Pull the [SEND_PHOTO] directive (if any) out of the assembled reply.
        const parsed = directiveFilter.finish()
        let finalContent = parsed.cleaned
        // Send a photo ONLY when the user explicitly asked this turn and can pay.
        // We deliberately do NOT honour a bare model-emitted [SEND_PHOTO]: under
        // the strong photo-capability prompt DeepSeek would spontaneously send
        // (and charge IMAGE_TOKEN_COST for) photos on a plain "hi", which users
        // never requested. The directive is still stripped from the text below
        // either way, so the marker never leaks. The explicit-request regex
        // (detectImageIntent) is the deterministic, user-initiated trigger.
        let photoRequested = explicitPhotoRequest && photoEligibility.eligible

        // ── Output safety filter (post-LLM) ──────────────────────────────────
        // Backstop for CSAM-class model drift, run over the user-visible text. A
        // hard block both replaces the text and cancels the photo — the reply is
        // no longer trustworthy enough to attach an image to.
        const outputVerdict = await checkAssistantOutput({
          payload,
          userId: user.id,
          text: finalContent,
          locale: convLanguage,
          relatedMessageId: assistantMsgId,
          relatedCharacterId: convCharacterId,
        })
        if (!outputVerdict.safe) {
          finalContent = outputVerdict.replacement
          photoRequested = false
        }

        // Consistency backstop: we send a photo whenever the user explicitly
        // asked and paid — independent of the LLM's words. DeepSeek sometimes
        // still refuses/deflects in the visible text ("I prefer to keep some
        // mystery…") while we charge and generate, leaving a refusal bubble next
        // to a real photo. When that happens, drop the refusal for a short
        // willing caption so words and image agree. Only triggers when a photo
        // is actually going out and the text reads like a refusal.
        if (photoRequested && looksLikePhotoRefusal(finalContent)) {
          finalContent = photoSendCaption(convLanguage, Number(assistantMsgId) || 0)
        }

        const hasText = finalContent.trim().length > 0

        // The streamed text (directive stripped) can drift from finalContent via
        // the whitespace tidy or a safety replacement — reconcile the client to
        // the canonical text whenever we touched it.
        if (hasText && (photoRequested || !outputVerdict.safe)) {
          send('replace', { text: finalContent })
        }

        if (hasText) {
          await payload.update({
            collection: 'messages',
            id: assistantMsgId,
            data: {
              content: finalContent,
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
                ...(outputVerdict.safe ? {} : { outputFiltered: true }),
                ...(photoRequested ? { sentPhoto: true } : {}),
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
              lastMessagePreview: finalContent.slice(0, 120),
              relationshipScore: computeRelationshipScore({ messageCount: newCnt, daysActiveCount: newDays, lastMessageAt: ts }),
            },
          })

          // Trigger memory extraction every 30 user messages (fire-and-forget).
          // The check uses newCnt (total messages, user+assistant = pairs of 2).
          // newCnt / 2 = user messages count.
          if (newCnt > 0 && (newCnt / 2) % 30 === 0) {
            const extractionMessages = historyDocs
              .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
              .map((m) => ({ role: m.role as string, content: m.content ?? '', id: m.id }))

            // Add the current user message and the just-generated assistant message.
            extractionMessages.push({ role: 'user', content: message, id: 'current-user' })
            extractionMessages.push({ role: 'assistant', content: finalContent, id: assistantMsgId })

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
        } else {
          // Photo-only reply (model sent just the directive) — drop the empty
          // placeholder text message; the image message carries the turn.
          await payload.delete({ collection: 'messages', id: assistantMsgId }).catch(() => {})
        }

        // ── Photo dispatch ───────────────────────────────────────────────────
        // The model is only taught the directive when the user is already
        // eligible (enough tokens, checked up front), so `photoRequested`
        // implies affordability. We still reserve tokens atomically via `spend`
        // here — that's the authoritative, race-safe gate against a balance that
        // dropped since the up-front check (e.g. a concurrent photo).
        let finishReason = 'stop'
        let pendingImageMsgId: string | null = null

        // Explicit request but not enough tokens → keep the natural text, pop
        // the token top-up nudge.
        if (photoBlockedReason === 'tokens') {
          finishReason = 'insufficient_tokens'
        }

        if (photoRequested && photoEligibility.eligible) {
          const imageRl = await checkRateLimit(IMAGE_GEN_LIMIT, `u:${user.id}`)
          if (!imageRl.allowed) {
            log.warn({ msg: 'chat.image.rate_limited', blockedBy: imageRl.blockedBy, retryAfterSeconds: imageRl.retryAfterSeconds })
            // Silently drop the photo; the text reply already went out.
          } else {
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
            const reserveKey = `image:reserve:${assistantImageMsgId}`
            const refundTechKey = `image:refund:tech:${assistantImageMsgId}`

            // Authoritative token gate: atomic reserve before we spend money at
            // fal. Fails closed if the balance dropped since the up-front check.
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
                data: { status: 'failed', errorReason: 'insufficient_tokens', completedAt: new Date().toISOString() },
              })
              finishReason = 'insufficient_tokens'
            } else {
              // Build the prompt the SAME way the admin "Generate scenes" flow
              // does (Atlas WAN 2.6). The old SDXL/FLUX-style builder produced a
              // prompt Atlas would sit on in `processing` forever; the admin
              // template (clean subjectTokens, Atlas-friendly phrasing) completes
              // fast. Read the live character for appearance + artStyle.
              let sceneAppearance:
                | {
                    appearancePrompt?: string | null
                    subjectTokens?: string | null
                    negativePrompt?: string | null
                    safetyAdultMarkers?: string[] | null
                  }
                | null = null
              let artStyle: 'realistic' | 'anime' | undefined
              // Face/identity anchor: the character's reference image (or its
              // primary gallery image). Conditioning on it keeps the face AND
              // tattoos consistent across photos — without it every photo is a
              // fresh text-to-image roll, so only the described traits (hair,
              // body) stay stable while the face/tattoos change each time.
              let referenceImageUrl: string | null = null
              try {
                const liveChar = await payload.findByID({
                  collection: 'characters',
                  id: convCharacterId,
                  depth: 1,
                  overrideAccess: true,
                })
                if (liveChar) {
                  const a = liveChar.appearance
                  if (a && typeof a === 'object') sceneAppearance = a as typeof sceneAppearance
                  const s = (liveChar as { artStyle?: unknown }).artStyle
                  if (s === 'anime' || s === 'realistic') artStyle = s

                  const denormRef = (liveChar as { referenceImageUrl?: unknown }).referenceImageUrl
                  if (typeof denormRef === 'string' && denormRef.trim()) {
                    referenceImageUrl = denormRef.trim()
                  } else {
                    const primary = (liveChar as { primaryImageId?: unknown }).primaryImageId
                    const url =
                      primary && typeof primary === 'object'
                        ? (primary as { publicUrl?: unknown }).publicUrl
                        : null
                    if (typeof url === 'string' && url.trim()) referenceImageUrl = url.trim()
                  }
                }
              } catch {
                // Fall back to the conversation snapshot's appearance below.
              }
              if (!sceneAppearance) {
                const snap = (conversation.characterSnapshot ?? {}) as {
                  appearance?: CharacterAppearance | null
                }
                sceneAppearance = (snap.appearance as typeof sceneAppearance) ?? null
              }

              // Scene = the model's [SEND_PHOTO: …] hint. The model often emits a
              // bare [SEND_PHOTO] even when the user gave a detailed request, so
              // when the directive carries no scene AND the user explicitly asked
              // for a photo this turn, recover the scene from their message —
              // otherwise their framing ("lying on the bed, in swimwear…") is lost
              // and the photo defaults to a portrait. A model-initiated photo (no
              // explicit request) keeps no scene: the user's message isn't a
              // photo description.
              const directiveScene = parsed.scene?.trim() ?? ''
              const rawScene =
                directiveScene || (explicitPhotoRequest ? sceneFromPhotoRequest(message) : '')

              const explicit = isExplicitPhotoScene(rawScene) || isExplicitPhotoScene(message)
              const shot = classifyShot(rawScene)
              // For explicit requests, drop embedded "send me a … photo"
              // imperatives (models read them as a request, not a depiction, so
              // "naked" buried in one leaves the subject clothed) and fold in
              // clean nudity tokens recovered from the request. No-op otherwise.
              const scene = resolveExplicitScene({ scene: rawScene, message, explicit })

              // Two dispatch paths:
              //   A. Reference image available → Atlas WAN 2.6 image-edit,
              //      conditioned on it. Keeps the same face/tattoos across photos
              //      while the prompt changes only the outfit/pose/setting. Warm
              //      (~12 s), no platform filter, so explicit edits work too.
              //   B. No reference → text-to-image fallback: explicit → warm Atlas,
              //      clothed → fast FLUX. Identity is only as stable as the
              //      appearance description (face/tattoos still drift).
              let modelId: string
              let prompt: string
              let negativePrompt: string
              if (referenceImageUrl) {
                modelId = ATLAS_IMAGE_EDIT_MODEL_ID
                ;({ prompt, negativePrompt } = buildCharacterEditPrompt({
                  scene,
                  artStyle,
                  explicit,
                }))
              } else {
                modelId = pickModelIdForStyle(artStyle ?? 'realistic', { explicit })
                const isFluxModel = findImageModel(modelId)?.isFlux ?? false
                ;({ prompt, negativePrompt } = buildCharacterScenePrompt({
                  appearance: sceneAppearance,
                  artStyle,
                  scene,
                  isFlux: isFluxModel,
                  shot,
                }))
              }

              const submitResult = await submitChatImageJob({
                payload,
                conversationId,
                messageId: assistantImageMsgId,
                userId: user.id,
                prompt,
                negativePrompt,
                modelId,
                imageSize: shotImageSize(shot),
                referenceImageUrl,
              })

              if (!submitResult.ok) {
                log.error({ msg: 'chat.image.submit_failed', conversationId, err: submitResult.error })
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
                // Drop the photo silently — the text reply stands.
              } else {
                pendingImageMsgId = assistantImageMsgId
                log.info({ msg: 'chat.image.submitted', conversationId, messageId: assistantImageMsgId })
              }
            }
          }
        }

        log.info({
          msg: 'chat.request.done',
          conversationId,
          latencyMs: Date.now() - handlerStart,
          sentPhoto: pendingImageMsgId !== null,
        })

        // Order matters: `done` commits the text bubble client-side, then the
        // image-pending placeholder is appended below it. ChatInterface polls
        // the image-status route from there until the photo resolves.
        send('done', { finishReason })
        if (pendingImageMsgId) {
          send('image-pending', { messageId: pendingImageMsgId })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        const isAbort =
          errorMsg.includes('abort') || errorMsg.includes('AbortError') || abortController.signal.aborted

        if (!isAbort) {
          log.error({ msg: 'chat.request.error', conversationId, err: errorMsg })
        }

        // Strip any (possibly partial) directive from the salvaged text so a
        // raw [SEND_PHOTO marker never lands in a persisted message.
        const salvaged = directiveFilter.finish().cleaned
        await payload.update({
          collection: 'messages',
          id: assistantMsgId,
          data: {
            content: salvaged,
            status: isAbort && salvaged ? 'completed' : 'failed',
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
