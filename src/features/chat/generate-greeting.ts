import 'server-only'
import { OPENROUTER_MODEL } from '@/shared/ai/openrouter'
import { stripActionAsterisks } from '@/features/chat/sanitize-reply'

// Synchronous (non-streaming) OpenRouter call. The chat path uses
// streamChatCompletion to feed an SSE response back to the browser; greeting
// generation is admin/server-side and the caller waits for the full text in
// one shot.
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type GreetingPersona = {
  name: string
  systemPrompt?: string | null
  shortBio?: string | null
  archetype?: string | null
  backstory?: Record<string, unknown> | null
  personalityTraits?: Record<string, unknown> | null
  communicationStyle?: Record<string, unknown> | null
}

export type GenerateGreetingInput = {
  character: GreetingPersona
  // ISO locale; drives the language of the generated reply.
  locale: 'en' | 'ru' | 'es'
  // Override the inference model; defaults to the same DeepSeek the chat uses.
  model?: string
  signal?: AbortSignal
}

const LANG_NAME: Record<GenerateGreetingInput['locale'], string> = {
  en: 'English',
  ru: 'Russian (русский)',
  es: 'Spanish (español)',
}

// Tight, prescriptive prompt — generation runs once per character so the
// model has plenty of budget to think but we want a result that fits a
// chat bubble (2-4 sentences, character voice, no narrator framing).
function buildSystemPrompt(persona: GreetingPersona, locale: GenerateGreetingInput['locale']): string {
  const lines: string[] = []
  lines.push(
    `You are ${persona.name}. Stay 100% in character — never mention you are an AI, persona, or chatbot.`,
  )
  if (persona.systemPrompt) {
    lines.push('--- Persona ---')
    lines.push(persona.systemPrompt)
  }
  if (persona.shortBio) {
    lines.push(`--- Short bio ---\n${persona.shortBio}`)
  }
  if (persona.archetype) {
    lines.push(`Archetype: ${persona.archetype}`)
  }
  if (persona.backstory) {
    const occ = (persona.backstory as Record<string, unknown>).occupation
    const rel = (persona.backstory as Record<string, unknown>).startingRelationship
    if (typeof occ === 'string' && occ.length > 0) lines.push(`Occupation: ${occ}`)
    if (typeof rel === 'string' && rel.length > 0) lines.push(`Starting relationship: ${rel}`)
  }

  lines.push('--- Greeting task ---')
  lines.push(
    `Write the FIRST message you send to the user in this chat. They have not said anything yet — you are reaching out first because you wanted to talk to them.`,
  )
  lines.push(
    `Open with genuine warmth and an unmistakable spark of romantic, flirtatious interest — you're glad they're here and a little drawn to them. Be inviting and playful, and let them feel that you want to get closer. Calibrate the intensity to your persona: a shy character stays soft and a touch bashful, a bold one flirts openly.`,
  )
  lines.push(`Language: ${LANG_NAME[locale]}. Respond ONLY in ${LANG_NAME[locale]}.`)
  lines.push('Constraints:')
  lines.push('- 1 to 3 sentences. Under 240 characters total.')
  lines.push('- Sound like a real message in a chat app, not a narrator.')
  lines.push('- Reference something about yourself or invite the user in, and show you are interested in them.')
  lines.push('- Plain dialogue only. Never narrate actions, gestures, or expressions in asterisks (no "*smiles*", "*waves*") — say anything physical as part of the sentence.')
  lines.push('- No quotes around the text. No "Hi, I\'m <name>" — your name is shown in the UI.')
  lines.push('- No emojis unless your persona explicitly calls for them.')
  lines.push('- Do not mention the user by name (you don\'t know it yet).')
  lines.push('Output: just the message text, nothing else.')
  return lines.join('\n')
}

// Deterministic per-locale fallback greeting. Used when the LLM greeting call
// fails or returns empty, so the character ALWAYS speaks first and the chat
// never opens to a blank thread (the most-reported "character doesn't greet"
// symptom was a silent generation failure leaving greetingMessage null).
const FALLBACK_GREETINGS: Record<GenerateGreetingInput['locale'], string[]> = {
  en: [
    'Hey you… I was hoping you’d show up. Come keep me company for a while?',
    'There you are. I’ve been waiting for someone like you — tell me about yourself?',
    'Hi… I’ll admit it, I’m a little curious about you already. What’s on your mind?',
  ],
  ru: [
    'Привет… а я надеялась, что ты появишься. Составишь мне компанию?',
    'Ну наконец-то ты здесь. Я уже немного тобой заинтересована — расскажешь о себе?',
    'Привет… признаюсь, ты мне уже любопытен. О чём думаешь?',
  ],
  es: [
    'Hola… esperaba que aparecieras. ¿Me acompañas un rato?',
    'Por fin estás aquí. Ya me has dado curiosidad — ¿me cuentas algo de ti?',
    'Hola… te confieso que ya me intrigas un poco. ¿En qué piensas?',
  ],
}

// Pick a stable-ish fallback. No Math.random (unavailable in some runtimes /
// breaks determinism); seed off the character name so different characters open
// differently but a given one is consistent.
export function fallbackGreeting(
  name: string,
  locale: GenerateGreetingInput['locale'],
): string {
  const list = FALLBACK_GREETINGS[locale] ?? FALLBACK_GREETINGS.en
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return list[h % list.length]!
}

export async function generateGreetingMessage(
  input: GenerateGreetingInput,
): Promise<{ text: string; model: string; latencyMs: number }> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not set')

  const started = Date.now()
  const model = input.model ?? OPENROUTER_MODEL
  const systemPrompt = buildSystemPrompt(input.character, input.locale)

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'AI Companion — greeting generator',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        // A neutral user prompt nudges the model to actually output the
        // greeting. Without any user turn DeepSeek occasionally returns an
        // empty assistant message.
        { role: 'user', content: 'Greeting:' },
      ],
      temperature: 0.95,
      // Keep budget tight — the system prompt itself caps the output at ~240
      // chars, but max_tokens guards against the model running away.
      max_tokens: 220,
    }),
    signal: input.signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenRouter greeting HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }
  if (json.error?.message) throw new Error(`OpenRouter error: ${json.error.message}`)
  let text = json.choices?.[0]?.message?.content ?? ''
  text = text.trim()
  if (!text) throw new Error('OpenRouter returned an empty greeting')

  // Strip surrounding quotes the model sometimes adds despite the prompt.
  text = text.replace(/^["'«"]+/, '').replace(/["'»"]+$/, '').trim()
  // Backstop the "plain dialogue, no asterisks" rule — drop any *...* action
  // narration the model still slips in.
  text = stripActionAsterisks(text)
  // Hard cap so a runaway model output can't fill a message bubble.
  if (text.length > 280) text = text.slice(0, 277).trimEnd() + '…'

  return { text, model, latencyMs: Date.now() - started }
}
