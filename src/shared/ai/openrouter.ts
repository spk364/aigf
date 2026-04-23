const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
// TODO: confirm slug via OpenRouter model catalog if deepseek-chat-v3-0324 is retired
export const OPENROUTER_MODEL = 'deepseek/deepseek-chat-v3-0324'

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type StreamOptions = {
  model: string
  messages: OpenRouterMessage[]
  temperature: number
  maxTokens: number
  signal?: AbortSignal
}

export async function* streamChatCompletion(
  options: StreamOptions,
): AsyncGenerator<{ delta: string; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const { model, messages, temperature, maxTokens, signal } = options

  const combinedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
    : AbortSignal.timeout(45000)

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'AI Companion',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: combinedSignal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`OpenRouter error ${response.status}: ${text}`)
  }

  if (!response.body) {
    throw new Error('OpenRouter response has no body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        const raw = trimmed.slice(5).trim()
        if (raw === '[DONE]') return

        try {
          const parsed = JSON.parse(raw) as {
            choices?: Array<{ delta?: { content?: string } }>
            usage?: { prompt_tokens: number; completion_tokens: number }
          }

          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            yield { delta: content, usage: parsed.usage }
          } else if (parsed.usage) {
            yield { delta: '', usage: parsed.usage }
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
