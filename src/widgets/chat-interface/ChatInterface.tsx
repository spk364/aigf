'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

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
  imagePending: string
  imageQueuePosition: string
  imageFailed: string
}

type Props = {
  initialConversationId?: string
  initialCharacterId?: string
  initialMessages: Message[]
  locale: string
  characterName?: string
  characterPhotoUrl?: string
  strings?: Partial<ChatStrings>
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
  imagePending: 'Generating image...',
  imageQueuePosition: 'Queue position: {n}',
  imageFailed: "Couldn't generate the image. Try again.",
}

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
}: Props) {
  const s = { ...defaultStrings, ...stringsProp }
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [streamingState, setStreamingState] = useState<StreamingState>('idle')
  const [draft, setDraft] = useState('')
  // currentMsgId tracked for potential future use (e.g. scroll-to-message)
  const [, setCurrentMsgId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Set when the server returns 429 (free-tier daily cap). Switches the error
  // banner into a paywall variant with a direct upgrade CTA.
  const [showUpgradeCta, setShowUpgradeCta] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const conversationIdRef = useRef<string | undefined>(initialConversationId)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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
  }, [messages])

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
    },
    [streamingState, initialCharacterId, locale, s.errorGeneric, s.errorQuota],
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

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant' && m.type !== 'image')
  const isStreaming = streamingState !== 'idle'
  const showTyping = isStreaming && !draft

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 sm:px-5 sm:py-4">
        <Link
          href={`/${locale}/chat`}
          aria-label={s.backToChats}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
        >
          <IconChevronLeft />
        </Link>
        <CharacterAvatar name={characterName} photoUrl={characterPhotoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[var(--color-text)]">{characterName}</p>
          <p className="text-xs text-[var(--color-success)]">Online</p>
        </div>
        <nav className="flex shrink-0 items-center gap-1">
          <Link
            href={`/${locale}/chat`}
            className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] sm:inline-flex"
          >
            {s.backToChats}
          </Link>
          <Link
            href={`/${locale}/dashboard`}
            className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] sm:inline-flex"
          >
            {s.dashboard}
          </Link>
          <Link
            href={`/${locale}`}
            aria-label={s.backToHome}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)]"
          >
            <IconHome />
          </Link>
        </nav>
      </header>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-6" role="log" aria-live="polite">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar for assistant */}
              {msg.role === 'assistant' && (
                <div className="mb-1">
                  <CharacterAvatar
                    name={characterName}
                    photoUrl={characterPhotoUrl}
                    size="sm"
                  />
                </div>
              )}

              {msg.type === 'image' && msg.imageUrl ? (
                <div className="group relative max-w-[320px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={msg.imageUrl}
                    alt={`Photo from ${characterName}`}
                    width={msg.imageWidth}
                    height={msg.imageHeight}
                    loading="eager"
                    className="rounded-2xl shadow-md h-auto w-full max-w-[320px] object-cover"
                  />
                </div>
              ) : msg.type === 'image' && msg.imageStatus === 'pending' ? (
                <div
                  aria-live="polite"
                  className="relative flex aspect-[3/4] w-[260px] items-center justify-center overflow-hidden rounded-2xl bg-[var(--color-surface-2)] shadow-md"
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
                <div className="rounded-2xl bg-[var(--color-surface-2)] px-4 py-3 text-sm text-[var(--color-text-muted)] shadow-md">
                  {s.imageFailed}
                </div>
              ) : (
                <div
                  className={`group relative max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'rounded-br-sm bg-[var(--color-accent-strong)] text-[var(--color-bg)]'
                      : 'rounded-bl-sm bg-[var(--color-surface-2)] text-[var(--color-text)]'
                  }`}
                >
                  <span className="whitespace-pre-wrap">{msg.content}</span>

                  {msg.role === 'assistant' && (
                    <div className="mt-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        aria-label={copiedId === msg.id ? s.copied : s.copy}
                        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                      >
                        <IconClipboard />
                        {copiedId === msg.id ? s.copied : s.copy}
                      </button>
                      {msg.id === lastAssistantMsg?.id && !isStreaming && (
                        <button
                          onClick={handleRegenerate}
                          aria-label={s.regenerate}
                          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                        >
                          <IconArrowPath />
                          {s.regenerate}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Streaming draft */}
          {draft && (
            <div className="flex items-end gap-2.5">
              <div className="mb-1">
                <CharacterAvatar
                  name={characterName}
                  photoUrl={characterPhotoUrl}
                  size="sm"
                />
              </div>
              <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-[var(--color-surface-2)] px-4 py-3 text-sm leading-relaxed text-[var(--color-text)]">
                <span className="whitespace-pre-wrap">{draft}</span>
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {showTyping && (
            <div className="flex items-end gap-2.5">
              <div className="mb-1">
                <CharacterAvatar
                  name={characterName}
                  photoUrl={characterPhotoUrl}
                  size="sm"
                />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-[var(--color-surface-2)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
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
        <div className="mx-auto w-full max-w-3xl px-4 pb-2">
          <div
            role="alert"
            className={
              showUpgradeCta
                ? 'flex items-center justify-between gap-3 rounded-xl border border-[var(--color-accent-strong)]/30 bg-[var(--color-accent-soft)] px-4 py-2.5 text-sm text-[var(--color-text)]'
                : 'rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-2.5 text-sm text-[var(--color-danger)]'
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

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            rows={1}
            placeholder={isStreaming ? '' : s.inputPlaceholder}
            className="flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none transition-colors focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)] disabled:opacity-50"
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-strong)] text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconArrowUp />
          </button>
        </div>
      </form>
    </div>
  )
}
