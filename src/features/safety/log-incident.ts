import type { Payload } from 'payload'
import { createLogger } from '@/shared/lib/logger'

const log = createLogger({ scope: 'safety' })

export type LogIncidentInput = {
  payload: Payload
  userId: string | number
  conversationId?: string | number
  messageId?: string | number
  characterId?: string | number
  layer: 'input' | 'output' | 'image' | 'builder'
  severity: 'soft_block' | 'hard_block' | 'critical'
  category: string
  matched: string[]
  inputSnippet: string
  locale?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

const SNIPPET_MAX_CHARS = 240

// Logs a safety_incidents row. Best-effort: failures must never break the
// caller path (we'd rather drop a single audit row than abort a user request
// that we just refused). Returns the new id on success, null on error.
export async function logSafetyIncident(input: LogIncidentInput): Promise<string | number | null> {
  const snippet = input.inputSnippet.slice(0, SNIPPET_MAX_CHARS)
  try {
    const created = await input.payload.create({
      collection: 'safety-incidents',
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        characterId: input.characterId,
        layer: input.layer,
        severity: input.severity,
        category: input.category,
        matched: input.matched,
        inputSnippet: snippet,
        locale: input.locale,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata,
      },
      overrideAccess: true,
    })
    return created.id
  } catch (err) {
    log.error({
      msg: 'safety.incident.persist_failed',
      err: err instanceof Error ? err.message : String(err),
      layer: input.layer,
      category: input.category,
      severity: input.severity,
    })
    return null
  }
}
