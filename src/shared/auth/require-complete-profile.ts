import 'server-only'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getCurrentUser } from './current-user'

/**
 * Requires the current user to be authenticated AND have a dateOfBirth set.
 * - No user → redirect to /[locale]/login
 * - User with no dateOfBirth → redirect to /[locale]/complete-profile
 * - User with dateOfBirth → return user
 *
 * Use this on pages that require a fully onboarded user (dashboard, chat, billing).
 * Use requireAuth() on pages that only need authentication (complete-profile, verify-email).
 */
export async function requireCompleteProfile() {
  const user = await getCurrentUser()
  const locale = await getLocale()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  const dateOfBirth = (user as unknown as { dateOfBirth?: string | null }).dateOfBirth

  if (!dateOfBirth) {
    redirect(`/${locale}/complete-profile`)
  }

  return user
}
