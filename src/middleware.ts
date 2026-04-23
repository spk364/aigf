import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  matcher: [
    // Match all paths except /admin, /api, /_next, /_vercel, and static files
    '/((?!admin|api|_next|_vercel|.*\\..*).*)',
  ],
}
