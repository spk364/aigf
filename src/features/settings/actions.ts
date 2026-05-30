'use server'

import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { logoutAction } from '@/features/auth/actions/logout'
import { track } from '@/shared/analytics/posthog'

const LOCALES = new Set(['en', 'ru', 'es'])

// All settings actions follow the codebase convention: mutate via Payload, then
// redirect back to the settings page with a ?saved= / ?error= marker the page
// reads to render a banner. No client state needed.

export async function updateProfileAction(formData: FormData): Promise<void> {
  const locale = await getLocale()
  const user = await getCurrentUser()
  if (!user) redirect(`/${locale}/login`)

  const displayNameRaw = formData.get('displayName')
  const userLocaleRaw = formData.get('locale')

  const displayName =
    typeof displayNameRaw === 'string' ? displayNameRaw.trim().slice(0, 50) : ''
  const userLocale =
    typeof userLocaleRaw === 'string' && LOCALES.has(userLocaleRaw) ? userLocaleRaw : undefined

  const payload = await getPayload({ config })
  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      displayName: displayName || null,
      ...(userLocale ? { locale: userLocale } : {}),
    },
    overrideAccess: true,
  })

  track({ userId: String(user.id), event: 'settings.profile_updated', properties: {} })
  redirect(`/${locale}/settings/profile?saved=1`)
}

export async function setNsfwAction(formData: FormData): Promise<void> {
  const locale = await getLocale()
  const user = await getCurrentUser()
  if (!user) redirect(`/${locale}/login`)

  // Checkbox posts 'on' when checked, absent when not.
  const enabled = formData.get('nsfwEnabled') === 'on'

  const payload = await getPayload({ config })
  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      nsfwEnabled: enabled,
      nsfwEnabledAt: enabled ? new Date().toISOString() : null,
    },
    overrideAccess: true,
  })

  track({
    userId: String(user.id),
    event: 'settings.nsfw_toggled',
    properties: { enabled },
  })
  redirect(`/${locale}/settings/content?saved=1`)
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const locale = await getLocale()
  const user = await getCurrentUser()
  if (!user) redirect(`/${locale}/login`)

  const current = formData.get('currentPassword')
  const next = formData.get('newPassword')
  const confirm = formData.get('confirmPassword')

  const fail = (code: string) => redirect(`/${locale}/settings/account?error=${code}`)

  if (typeof next !== 'string' || next.length < 10) fail('weak')
  if (next !== confirm) fail('mismatch')
  if (typeof current !== 'string' || current.length === 0) fail('current_required')

  const payload = await getPayload({ config })

  // Verify the current password by attempting a login. OAuth-only accounts have
  // no password set — surface a distinct error so they use reset-by-email.
  try {
    await payload.login({
      collection: 'users',
      data: { email: user.email, password: current as string },
    })
  } catch {
    fail('wrong_current')
  }

  await payload.update({
    collection: 'users',
    id: user.id,
    data: { password: next as string },
    overrideAccess: true,
  })

  track({ userId: String(user.id), event: 'settings.password_changed', properties: {} })
  redirect(`/${locale}/settings/account?saved=password`)
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const locale = await getLocale()
  const user = await getCurrentUser()
  if (!user) redirect(`/${locale}/login`)

  // Require the user to type the confirmation phrase, guarding against an
  // accidental click. The phrase is locale-independent ("DELETE").
  const confirm = formData.get('confirm')
  if (confirm !== 'DELETE') {
    redirect(`/${locale}/settings/account?error=confirm`)
  }

  const payload = await getPayload({ config })
  const now = new Date().toISOString()

  // Soft delete: mark the row deleted + status. A separate retention job purges
  // after 90 days (GDPR — handled in T0-3). We do NOT hard-delete here so the
  // user can be restored within the grace window and audit trails survive.
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { deletedAt: now, status: 'deleted' },
    overrideAccess: true,
  })

  track({ userId: String(user.id), event: 'settings.account_deleted', properties: {} })

  await logoutAction()
  redirect(`/${locale}?account_deleted=1`)
}
