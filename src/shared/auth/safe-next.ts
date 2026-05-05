/**
 * Validate a "next" redirect param so we never bounce a user to an
 * arbitrary external host. Only same-origin paths starting with "/" and
 * not "//" (protocol-relative) are accepted.
 */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== 'string') return null
  if (next.length === 0 || next.length > 512) return null
  if (!next.startsWith('/')) return null
  if (next.startsWith('//')) return null
  return next
}
