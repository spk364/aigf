'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatPaywallModal } from '@/widgets/paywall'
import type {
  ChatPaywallPlans,
  ChatPaywallReason,
  ChatPaywallStrings,
  PaywallTeaser,
} from '@/widgets/paywall'
import { PhotoComposer, type PhotoComposerStrings } from './PhotoComposer'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  type?: 'text' | 'image'
  // For type='image' only: tracks async fal generation status. The chat
  // route now submits and returns immediately; ChatInterface polls the
  // status endpoint until terminal — see useImageStatusPolling.
  imageStatus?: 'pending' | 'completed' | 'failed'
  imageProgress?: { phase: string; queuePosition?: number; lastLog?: string }
  imageError?: string
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
  mediaAssetId?: string | number
  // Cached TTS clip URL — set when the message was loaded from server with a
  // pre-existing audioAssetId, or after the lazy /tts call resolves.
  audioUrl?: string
}

type StreamingState = 'idle' | 'pending' | 'streaming'

export type ChatStrings = {
  typing: string
  regenerate: string
  copy: string
  copied: string
  inputPlaceholder: string
  send: string
  errorGeneric: string
  errorQuota: string
  upgradeCta: string
  backToChats: string
  backToHome: string
  dashboard: string
  gallery: string
  imagePending: string
  imageQueuePosition: string
  imageFailed: string
  askPhoto: string
  askVoice: string
  askVideo: string
  photoCost: string
  voiceCost: string
  videoCost: string
  tokensRemaining: string
  videoSoon: string
}

type Props = {
  initialConversationId?: string
  initialCharacterId?: string
  initialMessages: Message[]
  locale: string
  characterName?: string
  characterPhotoUrl?: string
  strings?: Partial<ChatStrings>
  /** Optional — when provided, the photo chip opens the outfit/pose/setting
      composer instead of sending a plain selfie. */
  photoComposer?: PhotoComposerStrings
  /** All paywall props are optional so existing call-sites keep compiling. */
  paywall?: {
    upgradeUrl: string
    tokensUrl: string
    plans: ChatPaywallPlans
    /** Pre-built per-reason copy. Selected at runtime when the modal opens. */
    stringsByReason: Record<ChatPaywallReason, ChatPaywallStrings>
    fallbackTeaser?: PaywallTeaser
  }
}

const defaultStrings: ChatStrings = {
  typing: 'is typing...',
  regenerate: 'Regenerate',
  copy: 'Copy',
  copied: 'Copied',
  inputPlaceholder: 'Type a message...',
  send: 'Send',
  errorGeneric: 'Something went wrong. Please try again.',
  errorQuota: 'You have reached your daily message limit.',
  upgradeCta: 'Upgrade',
  backToChats: 'All chats',
  backToHome: 'Home',
  dashboard: 'Dashboard',
  gallery: 'Gallery',
  imagePending: 'Generating image...',
  imageQueuePosition: 'Queue position: {n}',
  imageFailed: "Couldn't generate the image. Try again.",
  askPhoto: 'Send me a photo',
  askVoice: 'Voice message',
  askVideo: 'Make a video',
  photoCost: '{n} tokens',
  voiceCost: '{n} tokens',
  videoCost: '{n} tokens',
  tokensRemaining: '{n} tokens',
  videoSoon: 'Soon',
}

// Per-action token costs — single source of truth lives in
// `src/features/billing/cost.ts`. Mirrored here so the UI can preview a
// price without round-tripping to the server. Keep in sync.
const TOKEN_COSTS = {
  photo: 2,
  voice: 2,
  video: 20,
} as const

function parseSseChunk(raw: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = []
  const blocks = raw.split('\n\n')
  for (const block of blocks) {
    const lines = block.split('\n')
    let event = 'message'
    let data = ''
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data = line.slice(5).trim()
    }
    if (data) events.push({ event, data })
  }
  return events
}

// Inline SVG icons (heroicons outline)
function IconArrowUp() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
    </svg>
  )
}

function IconClipboard() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
      />
    </svg>
  )
}

function IconChevronLeft() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function IconHome() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12 12 3l9.75 9M4.5 9.75v9.75A1.5 1.5 0 0 0 6 21h3v-6h6v6h3a1.5 1.5 0 0 0 1.5-1.5V9.75"
      />
    </svg>
  )
}

function IconGallery() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
      />
    </svg>
  )
}

function IconCamera() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-6 w-6 opacity-60"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
    </svg>
  )
}

function IconArrowPath() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}

function IconSpeaker() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  )
}

function IconStop() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <rect x="5" y="4" width="3" height="12" rx="1" />
      <rect x="12" y="4" width="3" height="12" rx="1" />
    </svg>
  )
}

function IconCoin() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3 w-3"
      aria-hidden
    >
      <path d="M10 1.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zm.9 4.6v.7c1 .1 1.7.6 1.9 1.4l-1.3.3c-.1-.4-.5-.6-1-.6-.6 0-.9.2-.9.6 0 .3.2.5.8.6l.9.2c1.4.3 1.9.8 1.9 1.7 0 1-.7 1.6-1.7 1.8v.7H10v-.7c-1.1-.1-1.8-.6-2-1.6l1.3-.3c.1.5.5.7 1.1.7s.9-.2.9-.6c0-.3-.2-.5-.8-.6l-.9-.2c-1.3-.3-1.8-.8-1.8-1.7 0-1 .7-1.6 1.7-1.8v-.7h.5z" />
    </svg>
  )
}
function IconMic() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5M12 18.75a6 6 0 01-6-6v-1.5m6 7.5v3m-3.75-3a3.75 3.75 0 117.5 0V12a3.75 3.75 0 01-7.5 0V8.25z" />
    </svg>
  )
}
function IconVideo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25V7.5A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
    </svg>
  )
}
function IconPhoto() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  )
}
function IconLoader() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="h-3.5 w-3.5 animate-spin"
      aria-hidden
    >
      <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

function CharacterAvatar({
  name,
  photoUrl,
  size,
}: {
  name: string
  photoUrl?: string
  size: 'sm' | 'md' | 'lg'
}) {
  const dimensions =
    size === 'lg' ? 'h-11 w-11' : size === 'md' ? 'h-9 w-9' : 'h-7 w-7'
  const fontSize = size === 'lg' ? 'text-base' : size === 'md' ? 'text-sm' : 'text-xs'

  if (photoUrl) {
    return (
      <div className={`${dimensions} shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div
      className={`${dimensions} ${fontSize} flex shrink-0 items-center justify-center rounded-xl font-bold text-[var(--color-bg)]`}
      style={{
        background: 'linear-gradient(135deg, var(--color-accent-strong), var(--color-accent))',
      }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  )
}

export function ChatInterface({
  initialConversationId,
  initialCharacterId,
  initialMessages,
  locale,
  characterName = 'Anna',
  characterPhotoUrl,
  strings: stringsProp,
  photoComposer,
  paywall,
}: Props) {
  const s = { ...defaultStrings, ...stringsProp }
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  // Open state for the photo composer sheet (T1-3). Only used when the
  // photoComposer strings prop is supplied.
  const [photoComposerOpen, setPhotoComposerOpen] = useState(false)
  const [streamingState, setStreamingState] = useState<StreamingState>('idle')
  const [draft, setDraft] = useState('')
  // currentMsgId tracked for potential future use (e.g. scroll-to-message)
  const [, setCurrentMsgId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Set when the server returns 429 (free-tier daily cap). Switches the error
  // banner into a paywall variant with a direct upgrade CTA.
  const [showUpgradeCta, setShowUpgradeCta] = useState(false)
  // Inline paywall modal: opens when the server signals 429 or an out-of-
  // tokens error mid-stream. The chat-error banner still renders behind it
  // so a user who closes the modal still has the contextual nudge.
  const [paywallReason, setPaywallReason] = useState<ChatPaywallReason | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  // TTS playback state. Only one assistant clip plays at a time; clicking ▶
  // on another message stops the current one. `pendingTtsId` covers the
  // round-trip to /api/chat/messages/:id/tts (3-15 s on first click).
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [pendingTtsId, setPendingTtsId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const conversationIdRef = useRef<string | undefined>(initialConversationId)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Live token balance for cost previews next to action buttons. Refetched
  // after any action that may have spent tokens (image, TTS) and once on
  // mount. `null` means "not loaded" — UI hides the chip until we know.
  const [tokenBalance, setTokenBalance] = useState<number | null>(null)
  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/tokens/balance', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { balance: number }
      setTokenBalance(typeof data.balance === 'number' ? data.balance : null)
    } catch {
      // network blip — leave previous balance
    }
  }, [])

  useEffect(() => {
    void refreshBalance()
  }, [refreshBalance])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    // Scroll the message list directly (not via scrollIntoView). With
    // scrollIntoView the browser walks up looking for ANY scrollable
    // ancestor and will scroll the chat root even though it has
    // overflow-hidden — that shifts the header off-screen by tens of
    // pixels and made the chat header invisible.
    const el = messageListRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, draft])

  // ── Async image generation polling ────────────────────────────────────────
  // Once chat /api/chat returns an `image-pending` SSE event, the assistant
  // message lives in the list with imageStatus='pending'. We poll the status
  // route per-message until terminal. polledIdsRef prevents duplicate polling
  // across rerenders without forcing a useState→re-render cycle.
  const polledIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const POLL_INTERVAL_MS = 2000
    const MAX_ATTEMPTS = 90 // 90 × 2s = 3 min — covers cold-start + fal queue.

    const pendingImageMsgs = messages.filter(
      (m) => m.type === 'image' && m.imageStatus === 'pending' && !polledIdsRef.current.has(m.id),
    )

    if (pendingImageMsgs.length === 0) return

    const cancellers: Array<() => void> = []

    for (const msg of pendingImageMsgs) {
      polledIdsRef.current.add(msg.id)
      let cancelled = false
      let attempts = 0

      const poll = async () => {
        while (!cancelled && attempts < MAX_ATTEMPTS) {
          attempts += 1
          try {
            const res = await fetch(`/api/chat/messages/${encodeURIComponent(msg.id)}/image-status`, {
              cache: 'no-store',
            })
            if (!res.ok) {
              // 404/403 → terminal; stop polling.
              if (res.status === 404 || res.status === 403) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === msg.id ? { ...m, imageStatus: 'failed' as const } : m)),
                )
                return
              }
              // Transient — back off and retry.
              await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
              continue
            }
            const data = (await res.json()) as
              | { phase: 'pending'; progress: { phase: string; queuePosition?: number; lastLog?: string } }
              | { phase: 'completed'; mediaAssetId: string | number; publicUrl: string; width: number; height: number }
              | { phase: 'failed'; error: string }

            if (data.phase === 'completed') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msg.id
                    ? {
                        ...m,
                        imageStatus: 'completed' as const,
                        imageUrl: data.publicUrl,
                        imageWidth: data.width,
                        imageHeight: data.height,
                        mediaAssetId: data.mediaAssetId,
                        imageProgress: undefined,
                      }
                    : m,
                ),
              )
              void refreshBalance()
              return
            }
            if (data.phase === 'failed') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msg.id
                    ? { ...m, imageStatus: 'failed' as const, imageError: data.error, imageProgress: undefined }
                    : m,
                ),
              )
              return
            }
            // pending — surface progress, then wait and retry.
            setMessages((prev) =>
              prev.map((m) => (m.id === msg.id ? { ...m, imageProgress: data.progress } : m)),
            )
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
          } catch {
            // Network blip — back off and retry.
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
          }
        }
        // Hit MAX_ATTEMPTS without resolution — flag as failed so user isn't
        // stuck on a forever-spinner.
        if (!cancelled) {
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, imageStatus: 'failed' as const } : m)),
          )
        }
      }

      void poll()
      cancellers.push(() => {
        cancelled = true
      })
    }

    return () => {
      for (const cancel of cancellers) cancel()
    }
  }, [messages, refreshBalance])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streamingState !== 'idle') return

      setError(null)
      setShowUpgradeCta(false)
      setStreamingState('pending')
      setDraft('')

      const userMsg: Message = { id: `local-${Date.now()}`, role: 'user', content: text }
      setMessages((prev) => [...prev, userMsg])
      setInput('')

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }

      const body: Record<string, string> = { message: text, locale }
      if (conversationIdRef.current) {
        body['conversationId'] = conversationIdRef.current
      } else if (initialCharacterId) {
        body['characterId'] = initialCharacterId
      }

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (res.status === 429) {
          // Free-tier daily message cap. The server has not consumed the slot
          // (see checkAndIncrementQuota's decrement-on-reject). Surface a
          // paywall instead of the generic error and let the user upgrade.
          setError(s.errorQuota)
          setShowUpgradeCta(true)
          if (paywall) setPaywallReason('quota')
          setStreamingState('idle')
          return
        }

        if (!res.ok || !res.body) {
          throw new Error('Request failed')
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let draftContent = ''
        let finalMsgId: string | null = null

        setStreamingState('streaming')

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const newlineIndex = buffer.lastIndexOf('\n\n')
          if (newlineIndex === -1) continue

          const toProcess = buffer.slice(0, newlineIndex + 2)
          buffer = buffer.slice(newlineIndex + 2)

          const events = parseSseChunk(toProcess)
          for (const { event, data } of events) {
            if (event === 'conversation') {
              const parsed = JSON.parse(data) as { conversationId: string | number }
              conversationIdRef.current = String(parsed.conversationId)
              // history.replaceState updates the URL without remounting the route,
              // so the ongoing SSE stream (delta / done events) keeps working.
              if (typeof window !== 'undefined') {
                window.history.replaceState(null, '', `/${locale}/chat/${parsed.conversationId}`)
              }
            } else if (event === 'message') {
              const parsed = JSON.parse(data) as { messageId: string }
              finalMsgId = parsed.messageId
              setCurrentMsgId(finalMsgId)
            } else if (event === 'delta') {
              const parsed = JSON.parse(data) as { text: string }
              draftContent += parsed.text
              setDraft(draftContent)
            } else if (event === 'replace') {
              // Output safety filter substituted the reply — discard what we
              // streamed and show the refusal instead. The 'done' that follows
              // commits this replaced text.
              const parsed = JSON.parse(data) as { text: string }
              draftContent = parsed.text
              setDraft(draftContent)
            } else if (event === 'image-pending') {
              // Server has submitted a fal job and saved handles. Push a
              // placeholder message; useImageStatusPolling will resolve it.
              const parsed = JSON.parse(data) as { messageId: string }
              const placeholder: Message = {
                id: parsed.messageId,
                role: 'assistant',
                content: '',
                type: 'image',
                imageStatus: 'pending',
              }
              setMessages((prev) => [...prev, placeholder])
              setDraft('')
              setCurrentMsgId(null)
            } else if (event === 'done') {
              const finishReason = (JSON.parse(data) as { finishReason?: string }).finishReason
              // Paywall: free user attempted a Premium-only request, or any
              // user ran out of tokens mid-stream. Both already wrote an
              // "Upgrade" message into the conversation; we additionally pop
              // the inline modal so the CTA is hard to miss.
              if (paywall && finishReason === 'entitlement_denied') {
                setPaywallReason('premium_feature')
              } else if (paywall && finishReason === 'insufficient_tokens') {
                setPaywallReason('tokens')
              }
              // image_submitted means the image-pending placeholder is already
              // in the message list — nothing to commit from the text draft.
              const isImagePath = finishReason === 'image_submitted' || finishReason === 'image_generated'
              if (!isImagePath) {
                const committedMsg: Message = {
                  id: finalMsgId ?? `assistant-${Date.now()}`,
                  role: 'assistant',
                  content: draftContent,
                }
                setMessages((prev) => [...prev, committedMsg])
                setDraft('')
                setCurrentMsgId(null)
              }
              setStreamingState('idle')
            } else if (event === 'error') {
              const parsed = JSON.parse(data) as { message: string; reason?: string }
              setError(parsed.message)
              if (paywall && parsed.reason === 'insufficient_tokens') {
                setPaywallReason('tokens')
              }
              setStreamingState('idle')
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(s.errorGeneric)
        }
        setStreamingState('idle')
      }
    },
    [streamingState, initialCharacterId, locale, s.errorGeneric, s.errorQuota, paywall],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleRegenerate = useCallback(async () => {
    if (!conversationIdRef.current || streamingState !== 'idle') return

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistant) return

    setError(null)
    setStreamingState('pending')
    setDraft('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversationIdRef.current,
          messageId: lastAssistant.id,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let draftContent = ''
      let finalMsgId: string | null = null

      setStreamingState('streaming')
      setMessages((prev) => prev.filter((m) => m.id !== lastAssistant.id))

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const newlineIndex = buffer.lastIndexOf('\n\n')
        if (newlineIndex === -1) continue

        const toProcess = buffer.slice(0, newlineIndex + 2)
        buffer = buffer.slice(newlineIndex + 2)

        const events = parseSseChunk(toProcess)
        for (const { event, data } of events) {
          if (event === 'message') {
            const parsed = JSON.parse(data) as { messageId: string }
            finalMsgId = parsed.messageId
            setCurrentMsgId(finalMsgId)
          } else if (event === 'delta') {
            const parsed = JSON.parse(data) as { text: string }
            draftContent += parsed.text
            setDraft(draftContent)
          } else if (event === 'done') {
            const committedMsg: Message = {
              id: finalMsgId ?? `assistant-${Date.now()}`,
              role: 'assistant',
              content: draftContent,
            }
            setMessages((prev) => [...prev, committedMsg])
            setDraft('')
            setCurrentMsgId(null)
            setStreamingState('idle')
          } else if (event === 'error') {
            const parsed = JSON.parse(data) as { message: string }
            setError(parsed.message)
            setStreamingState('idle')
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(s.errorGeneric)
      }
      setStreamingState('idle')
    }
  }, [messages, streamingState, s.errorGeneric])

  const handleCopy = useCallback(async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // clipboard unavailable
    }
  }, [])

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingId(null)
  }, [])

  const playUrl = useCallback((id: string, url: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    const audio = new Audio(url)
    const cleanup = () => {
      setPlayingId((cur) => (cur === id ? null : cur))
      audioRef.current = null
    }
    audio.addEventListener('ended', cleanup)
    audio.addEventListener('error', cleanup)
    audio.play().catch(cleanup)
    audioRef.current = audio
    setPlayingId(id)
  }, [])

  const handleToggleTts = useCallback(
    async (id: string) => {
      // Toggle off if this clip is currently playing.
      if (playingId === id) {
        stopPlayback()
        return
      }
      // Local-only optimistic ids (set by sendMessage before the server
      // assigns a real id) can't be voiced — they don't exist server-side.
      if (id.startsWith('local-')) return
      const msg = messages.find((m) => m.id === id)
      if (!msg) return
      if (msg.audioUrl) {
        playUrl(id, msg.audioUrl)
        return
      }
      if (pendingTtsId) return
      setPendingTtsId(id)
      try {
        const res = await fetch(`/api/chat/messages/${encodeURIComponent(id)}/tts`, {
          method: 'POST',
        })
        if (!res.ok) return
        const data = (await res.json()) as { ok?: boolean; audioUrl?: string }
        if (!data.ok || !data.audioUrl) return
        const audioUrl = data.audioUrl
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, audioUrl } : m)),
        )
        playUrl(id, audioUrl)
        void refreshBalance()
      } catch {
        // Surface failure quietly — chat is still readable; the user can retry.
      } finally {
        setPendingTtsId((cur) => (cur === id ? null : cur))
      }
    },
    [messages, playingId, pendingTtsId, playUrl, stopPlayback, refreshBalance],
  )

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant' && m.type !== 'image')
  const isStreaming = streamingState !== 'idle'
  const showTyping = isStreaming && !draft

  // Welcome-state chips only appear before the user has sent anything. They
  // route to common opener intents we know the chat handles well — image
  // requests trigger the image-intent detector in /api/chat.
  const hasUserSent = messages.some((m) => m.role === 'user')
  const welcomeChips = !hasUserSent
    ? [
        { label: '👋 Say hi', text: 'Hey, how are you?' },
        { label: '🍷 Plans', text: 'What are you up to tonight?' },
      ]
    : []

  const hasEnoughTokens = (cost: number) => tokenBalance === null || tokenBalance >= cost

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-bg)]"
      style={{
        // iOS home-indicator clearance for the composer only — the notch is
        // already handled by DashboardShell's top bar above us, so adding
        // safe-area-inset-top here would just push our header off-screen.
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Backdrop: blurred character photo bleeds through the entire chat
          at very low opacity for an immersive, in-her-room feel. */}
      {characterPhotoUrl && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={characterPhotoUrl}
            alt=""
            className="h-full w-full scale-110 object-cover opacity-[0.07] blur-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-bg)]/40 via-transparent to-[var(--color-bg)]" />
        </div>
      )}

      {/* Header — shrink-0 inside the flex-col so it can never be squeezed
          out by the message list. min-h guards against collapse on small
          viewports. Solid bg (not /80) so messages don't bleed through if
          the backdrop-blur fails on older browsers. */}
      <header className="relative z-20 flex min-h-[3.5rem] shrink-0 items-center gap-2 border-b border-white/5 bg-[var(--color-bg)]/95 px-3 py-2 backdrop-blur-md sm:gap-3 sm:px-5 sm:py-3">
        <Link
          href={`/${locale}/chat`}
          aria-label={s.backToChats}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--color-text-muted)] transition-all duration-200 hover:bg-white/10 hover:text-[var(--color-text)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
        >
          <IconChevronLeft />
        </Link>
        <div className="relative">
          <CharacterAvatar name={characterName} photoUrl={characterPhotoUrl} size="md" />
          {/* Online dot — sits on the avatar like Telegram/Instagram. */}
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--color-bg)] bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-[var(--color-text)] sm:text-base">
            {characterName}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
            {showTyping ? (
              <span className="font-medium text-[var(--color-accent)] animate-fade-in">
                {s.typing}
              </span>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Online</span>
              </>
            )}
          </p>
        </div>
        <nav className="flex shrink-0 items-center gap-1">
          {/* Token balance pill — visible only after first balance fetch.
              Doubles as a CTA to /tokens for top-up. */}
          {tokenBalance !== null && (
            <Link
              href={`/${locale}/tokens`}
              title={s.tokensRemaining.replace('{n}', String(tokenBalance))}
              className="hidden cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-[var(--color-surface)]/60 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-all duration-200 hover:scale-105 hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface-2)] sm:inline-flex"
            >
              <span className="text-[var(--color-accent)]"><IconCoin /></span>
              <span>{tokenBalance}</span>
            </Link>
          )}
          {/* Gallery — only on an existing conversation (a brand-new chat has
              no images yet). Links to the per-character gallery. */}
          {initialConversationId && (
            <Link
              href={`/${locale}/chat/${initialConversationId}/gallery`}
              aria-label={s.gallery}
              title={s.gallery}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--color-text-muted)] transition-all duration-200 hover:bg-white/10 hover:text-[var(--color-text)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
            >
              <IconGallery />
            </Link>
          )}
          <Link
            href={`/${locale}/dashboard`}
            aria-label={s.dashboard}
            className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--color-text-muted)] transition-all duration-200 hover:bg-white/10 hover:text-[var(--color-text)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] sm:flex"
            title={s.dashboard}
          >
            <IconHome />
          </Link>
        </nav>
      </header>

      {/* Message list */}
      <div
        ref={messageListRef}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-4"
        role="log"
        aria-live="polite"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user'
            // Hide the avatar for consecutive assistant turns — only the
            // last bubble in a run gets a face. Matches WhatsApp grouping.
            const prevMsg = idx > 0 ? messages[idx - 1] : null
            const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null
            const showAvatar = !isUser && (!nextMsg || nextMsg.role !== 'assistant')
            const isGrouped = prevMsg && prevMsg.role === msg.role

            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2 animate-bubble-in ${isUser ? 'flex-row-reverse' : 'flex-row'} ${isGrouped ? 'mt-0.5' : 'mt-1.5'}`}
              >
                {/* Avatar slot for assistant — empty placeholder keeps the
                    bubble column aligned across grouped messages. */}
                {!isUser && (
                  <div className="w-8 shrink-0">
                    {showAvatar && (
                      <CharacterAvatar
                        name={characterName}
                        photoUrl={characterPhotoUrl}
                        size="sm"
                      />
                    )}
                  </div>
                )}

                {msg.type === 'image' && msg.imageUrl ? (
                  <div className="group relative max-w-[260px] sm:max-w-[320px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={msg.imageUrl}
                      alt={`Photo from ${characterName}`}
                      width={msg.imageWidth}
                      height={msg.imageHeight}
                      loading="eager"
                      className="h-auto w-full cursor-zoom-in rounded-3xl object-cover shadow-lg ring-1 ring-white/5 transition-transform duration-300 hover:scale-[1.01] active:scale-[0.99]"
                    />
                  </div>
                ) : msg.type === 'image' && msg.imageStatus === 'pending' ? (
                  <div
                    aria-live="polite"
                    className="relative flex aspect-[3/4] w-[240px] items-center justify-center overflow-hidden rounded-3xl border border-white/5 bg-[var(--color-surface-2)]/90 shadow-lg backdrop-blur-sm sm:w-[260px]"
                  >
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[var(--color-surface-2)] via-[var(--color-surface-3)] to-[var(--color-surface-2)]" />
                    <div className="relative flex flex-col items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <IconCamera />
                      <span>{s.imagePending}</span>
                      {msg.imageProgress?.queuePosition !== undefined && msg.imageProgress.queuePosition > 0 && (
                        <span className="text-[10px] opacity-70">
                          {s.imageQueuePosition.replace('{n}', String(msg.imageProgress.queuePosition))}
                        </span>
                      )}
                    </div>
                  </div>
                ) : msg.type === 'image' && msg.imageStatus === 'failed' ? (
                  <div className="rounded-3xl rounded-bl-md border border-white/5 bg-[var(--color-surface-2)]/90 px-4 py-2.5 text-[15px] leading-snug text-[var(--color-text-muted)] shadow-sm backdrop-blur-sm">
                    {s.imageFailed}
                  </div>
                ) : (
                  <div
                    className={`group relative max-w-[80%] px-4 py-2.5 text-[15px] leading-snug shadow-sm sm:max-w-[70%] ${
                      isUser
                        ? 'rounded-3xl rounded-br-md bg-[var(--color-accent-strong)] text-[var(--color-bg)]'
                        : 'rounded-3xl rounded-bl-md border border-white/5 bg-[var(--color-surface-2)]/90 text-[var(--color-text)] backdrop-blur-sm'
                    }`}
                  >
                    <span className="whitespace-pre-wrap">{msg.content}</span>

                    {!isUser && (
                      <div className="mt-1.5 flex items-center gap-1 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100">
                        {!msg.id.startsWith('local-') && (
                          <button
                            onClick={() => handleToggleTts(msg.id)}
                            disabled={pendingTtsId !== null && pendingTtsId !== msg.id}
                            aria-label={playingId === msg.id ? 'Stop' : 'Play voice'}
                            title={playingId === msg.id ? 'Stop' : s.voiceCost.replace('{n}', String(TOKEN_COSTS.voice))}
                            className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)] transition-all duration-200 hover:bg-white/10 hover:text-[var(--color-text)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {pendingTtsId === msg.id
                              ? <IconLoader />
                              : playingId === msg.id
                                ? <IconStop />
                                : <IconSpeaker />}
                            {/* Show cost only if we never played + haven't cached the clip yet */}
                            {!msg.audioUrl && pendingTtsId !== msg.id && playingId !== msg.id && (
                              <span className="inline-flex items-center gap-0.5 text-[var(--color-text-muted)]/80">
                                <IconCoin />
                                {TOKEN_COSTS.voice}
                              </span>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          aria-label={copiedId === msg.id ? s.copied : s.copy}
                          className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)] transition-all duration-200 hover:bg-white/10 hover:text-[var(--color-text)] active:scale-95"
                        >
                          <IconClipboard />
                          {copiedId === msg.id ? s.copied : ''}
                        </button>
                        {msg.id === lastAssistantMsg?.id && !isStreaming && (
                          <button
                            onClick={handleRegenerate}
                            aria-label={s.regenerate}
                            className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--color-text-muted)] transition-all duration-200 hover:bg-white/10 hover:text-[var(--color-text)] active:scale-95"
                          >
                            <IconArrowPath />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Streaming draft */}
          {draft && (
            <div className="mt-1.5 flex items-end gap-2">
              <div className="w-8 shrink-0">
                <CharacterAvatar
                  name={characterName}
                  photoUrl={characterPhotoUrl}
                  size="sm"
                />
              </div>
              <div className="max-w-[80%] rounded-3xl rounded-bl-md border border-white/5 bg-[var(--color-surface-2)]/90 px-4 py-2.5 text-[15px] leading-snug text-[var(--color-text)] shadow-sm backdrop-blur-sm sm:max-w-[70%]">
                <span className="whitespace-pre-wrap">{draft}</span>
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {showTyping && (
            <div className="mt-1.5 flex items-end gap-2">
              <div className="w-8 shrink-0">
                <CharacterAvatar
                  name={characterName}
                  photoUrl={characterPhotoUrl}
                  size="sm"
                />
              </div>
              <div className="rounded-3xl rounded-bl-md border border-white/5 bg-[var(--color-surface-2)]/90 px-4 py-3 text-[var(--color-text-muted)] shadow-sm backdrop-blur-sm">
                <TypingDots />
                <span className="sr-only">
                  {characterName} {s.typing}
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="relative z-10 mx-auto w-full max-w-3xl shrink-0 px-4 pb-2">
          <div
            role="alert"
            className={
              showUpgradeCta
                ? 'flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-accent-strong)]/30 bg-[var(--color-accent-soft)] px-4 py-2.5 text-sm text-[var(--color-text)]'
                : 'rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-2.5 text-sm text-[var(--color-danger)]'
            }
          >
            <span>{error}</span>
            {showUpgradeCta && (
              <a
                href={`/${locale}/upgrade`}
                className="shrink-0 rounded-lg bg-[var(--color-accent-strong)] px-3 py-1.5 text-xs font-bold text-[var(--color-bg)] hover:bg-[var(--color-accent)]"
              >
                {s.upgradeCta}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Photo composer sheet — opens from the photo chip when strings provided. */}
      {photoComposer && photoComposerOpen && (
        <div className="relative z-10 shrink-0 pb-2">
          <PhotoComposer
            strings={photoComposer}
            cost={TOKEN_COSTS.photo}
            onClose={() => setPhotoComposerOpen(false)}
            onSubmit={(message) => {
              setPhotoComposerOpen(false)
              sendMessage(message)
            }}
          />
        </div>
      )}

      {/* Token-cost action chips — always visible above composer (collapses on
          mobile to scroll horizontally). Shows the user exactly what each
          paid action costs before they spend. */}
      <div className="relative z-10 mx-auto w-full max-w-3xl shrink-0 px-3 pb-1 sm:px-4">
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {welcomeChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => sendMessage(chip.text)}
              disabled={isStreaming}
              className="shrink-0 cursor-pointer rounded-full border border-white/10 bg-[var(--color-surface-2)]/70 px-3 py-1.5 text-xs font-medium text-[var(--color-text)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
          {/* Photo: triggers image-intent in /api/chat → fal.ai generation */}
          <TokenCostChip
            icon={<IconPhoto />}
            label={s.askPhoto}
            cost={TOKEN_COSTS.photo}
            disabled={isStreaming || !hasEnoughTokens(TOKEN_COSTS.photo)}
            onClick={() => {
              if (photoComposer) setPhotoComposerOpen((v) => !v)
              else sendMessage('Send me a selfie')
            }}
          />
          {/* Voice: this just hints the user to use the per-message TTS button.
              We highlight that voice playback costs tokens here so users
              expect the charge before clicking the speaker on a bubble. */}
          <TokenCostChip
            icon={<IconMic />}
            label={s.askVoice}
            cost={TOKEN_COSTS.voice}
            disabled={isStreaming || !lastAssistantMsg || !hasEnoughTokens(TOKEN_COSTS.voice)}
            onClick={() => {
              // Play the latest assistant message (or noop if none yet)
              if (lastAssistantMsg) handleToggleTts(lastAssistantMsg.id)
            }}
          />
          {/* Video: gated on Premium+/token availability. We don't have a
              video pipeline shipped yet — clicking shows the "soon" badge
              path via title; no-op send keeps users from spending. */}
          <TokenCostChip
            icon={<IconVideo />}
            label={s.askVideo}
            cost={TOKEN_COSTS.video}
            disabled
            badge={s.videoSoon}
          />
        </div>
      </div>

      {paywall && (
        <ChatPaywallModal
          open={paywallReason !== null}
          onClose={() => setPaywallReason(null)}
          reason={paywallReason ?? 'quota'}
          locale={locale}
          upgradeUrl={paywall.upgradeUrl}
          tokensUrl={paywall.tokensUrl}
          characterName={characterName}
          characterPhotoUrl={characterPhotoUrl}
          fallbackTeaser={paywall.fallbackTeaser}
          plans={paywall.plans}
          strings={paywall.stringsByReason[paywallReason ?? 'quota']}
        />
      )}

      {/* Composer — pill-shaped sticky input */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 shrink-0 px-3 pb-3 pt-2 sm:px-4 sm:pb-4"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-full border border-white/10 bg-[var(--color-surface)]/95 p-1.5 shadow-lg shadow-black/20 backdrop-blur-md transition-all duration-200 focus-within:border-[var(--color-accent-strong)]/40 focus-within:ring-2 focus-within:ring-[var(--color-accent-strong)]/20">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            rows={1}
            placeholder={isStreaming ? '' : s.inputPlaceholder}
            className="flex-1 resize-none bg-transparent px-4 py-2.5 text-[15px] text-[var(--color-text)] placeholder-[var(--color-text-muted)]/60 outline-none disabled:opacity-50"
            style={{ maxHeight: '160px', overflowY: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${el.scrollHeight}px`
            }}
            aria-label={s.inputPlaceholder}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            aria-label={s.send}
            className="group flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-accent-strong)] text-[var(--color-bg)] transition-all duration-200 hover:scale-110 hover:bg-[var(--color-accent)] hover:shadow-lg hover:shadow-[var(--color-accent-strong)]/40 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <span className="transition-transform duration-200 group-hover:-translate-y-px">
              <IconArrowUp />
            </span>
          </button>
        </div>
      </form>
    </div>
  )
}

function TokenCostChip({
  icon,
  label,
  cost,
  onClick,
  disabled,
  badge,
}: {
  icon: React.ReactNode
  label: string
  cost: number
  onClick?: () => void
  disabled?: boolean
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} — ${cost} tokens`}
      className="group relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-[var(--color-surface-2)]/70 px-3 py-1.5 text-xs font-medium text-[var(--color-text)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-accent-strong)]/40 hover:bg-[var(--color-surface)] hover:shadow-md hover:shadow-[var(--color-accent-strong)]/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-[var(--color-surface-2)]/70"
    >
      <span className="text-[var(--color-text-muted)] transition-colors duration-200 group-hover:text-[var(--color-accent)]">
        {icon}
      </span>
      <span>{label}</span>
      <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
        <IconCoin />
        {cost}
      </span>
      {badge && (
        <span className="ml-0.5 rounded-full border border-white/10 bg-[var(--color-bg)]/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
          {badge}
        </span>
      )}
    </button>
  )
}
