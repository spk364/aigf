import 'server-only'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getCurrentUser } from './current-user'

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    const locale = await getLocale()
    redirect(`/${locale}/login`)
  }
  return user
}
