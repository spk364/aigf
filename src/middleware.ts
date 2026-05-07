import { NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createIntlMiddleware(routing)

// Optional staging password gate. When SITE_PASSWORD is set, any request to a
// `.vercel.app` host (preview deploys + the unattached prod alias) requires a
// HTTP Basic Auth credential whose password matches the env var. Username is
// ignored. Once a custom domain is attached and you stop relying on
// *.vercel.app, the gate auto-disappears for that domain — set
// FORCE_BASIC_AUTH=1 to keep it on the custom domain too.
//
// Notes:
//  - Basic Auth = base64 (not encryption). Safe over HTTPS for staging access;
//    don't use this to protect anything truly sensitive.
//  - /api/* is not matched here — admin routes already gate via getCurrentUser.
//  - Buffer is available in the Edge runtime as of Next 15.
function isBasicAuthRequired(host: string): boolean {
  if (!process.env.SITE_PASSWORD) return false
  if (process.env.FORCE_BASIC_AUTH === '1') return true
  return host.endsWith('.vercel.app')
}

function checkBasicAuth(req: NextRequest): boolean {
  const header = req.headers.get('authorization')
  if (!header || !header.startsWith('Basic ')) return false
  const encoded = header.slice('Basic '.length).trim()
  let decoded: string
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8')
  } catch {
    return false
  }
  const idx = decoded.indexOf(':')
  if (idx < 0) return false
  const provided = decoded.slice(idx + 1)
  return provided === process.env.SITE_PASSWORD
}

export default function middleware(req: NextRequest): NextResponse | Response {
  const host = req.headers.get('host') ?? ''
  if (isBasicAuthRequired(host) && !checkBasicAuth(req)) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Staging"',
        // Don't let a 401 sneak into a CDN cache and re-prompt every visitor
        // for the rest of the cache window.
        'Cache-Control': 'no-store',
      },
    })
  }

  // /admin (Payload) and /api/* don't go through next-intl — feeding them in
  // makes the locale-rewrite logic try to prepend a locale segment and 404.
  // The Basic Auth check above still runs for those paths so the staging gate
  // covers the whole site, including the admin login screen.
  const path = req.nextUrl.pathname
  if (path.startsWith('/admin') || path.startsWith('/api')) {
    return NextResponse.next()
  }

  return intlMiddleware(req)
}

export const config = {
  matcher: [
    // Match every request path except Next.js internals, Vercel internals,
    // and static assets. /admin and /api ARE matched here so Basic Auth can
    // gate them; the handler skips next-intl for those paths.
    '/((?!_next|_vercel|.*\\..*).*)',
  ],
}
