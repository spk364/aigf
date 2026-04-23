import { createLogger } from './logger'

// ---------------------------------------------------------------------------
// Request ID extraction
// ---------------------------------------------------------------------------

export function getRequestContext(headers: Headers): { requestId: string } {
  const requestId = headers.get('x-request-id') ?? crypto.randomUUID()
  return { requestId }
}

// ---------------------------------------------------------------------------
// Thin wrapper for route handlers
// ---------------------------------------------------------------------------

type BoundLogger = ReturnType<typeof createLogger>

type HandlerWithLogger<T> = (log: BoundLogger) => Promise<T>

export async function withRequestLogger<T>(
  headers: Headers,
  userId: string | undefined,
  handler: HandlerWithLogger<T>,
): Promise<T> {
  const { requestId } = getRequestContext(headers)
  const log = createLogger({ requestId, ...(userId ? { userId } : {}) })
  return handler(log)
}
