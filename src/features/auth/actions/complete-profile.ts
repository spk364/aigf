'use server'

import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getCurrentUser } from '@/shared/auth/current-user'
import { track } from '@/shared/analytics/posthog'
import { headers as getHeaders } from 'next/headers'
import { claimGuestDraftForUser } from '@/features/builder/guest-claim'

function isAtLeast18(dob: Date): boolean {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age -= 1
  }
  return age >= 18
}

export type CompleteProfileState =
  | { success: true }
  | { success: false; error: string; field?: string }

export async function completeProfileAction(
  formData: FormData,
): Promise<CompleteProfileState> {
  const locale = await getLocale()
  const user = await getCurrentUser()

  if (!user) {
    redirect(`/${locale}/login`)
  }

  const dateOfBirthRaw = formData.get('dateOfBirth')
  const agreeRaw = formData.get('agreeToTerms')

  if (!agreeRaw || agreeRaw !== 'true') {
    return { success: false, error: 'mustAgree', field: 'agreeToTerms' }
  }

  if (!dateOfBirthRaw || typeof dateOfBirthRaw !== 'string' || !dateOfBirthRaw.trim()) {
    return { success: false, error: 'underage', field: 'dateOfBirth' }
  }

  const dob = new Date(dateOfBirthRaw)
  if (isNaN(dob.getTime()) || !isAtLeast18(dob)) {
    return { success: false, error: 'underage', field: 'dateOfBirth' }
  }

  const payload = await getPayload({ config })
  const now = new Date().toISOString()

  // Update user record
  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      dateOfBirth: dateOfBirthRaw,
      ageVerifiedAt: now,
      ageVerificationMethod: 'self_declaration',
    },
    overrideAccess: true,
  })

  // Write age-verification audit row
  const headersList = await getHeaders()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'
  const userAgent = headersList.get('user-agent') ?? 'unknown'

  try {
    await payload.create({
      collection: 'age-verifications',
      data: {
        userId: user.id,
        method: 'self_declaration',
        verifiedAt: now,
        ipAddress: ip,
        userAgent,
        dateOfBirthProvided: dateOfBirthRaw,
      },
      overrideAccess: true,
    })
  } catch {
    // Non-blocking — audit log failure must not block profile completion
    payload.logger.error({ msg: 'Failed to write age-verification audit log', userId: user.id })
  }

  // Track profile completion
  const userLocale = (user as unknown as { locale?: string }).locale ?? locale
  track({
    userId: String(user.id),
    event: 'user.profile_completed',
    properties: { provider: 'google', locale: userLocale },
  })

  // Adopt any guest builder draft created before sign-in.
  let claimedDraftId: string | undefined
  try {
    const claim = await claimGuestDraftForUser(user.id)
    if (claim.claimed) {
      claimedDraftId = claim.draftId
      track({
        userId: String(user.id),
        event: 'builder.guest_draft_claimed',
        properties: { draftId: claim.draftId },
      })
    }
  } catch {
    // Non-blocking
  }

  if (claimedDraftId) {
    redirect(`/${locale}/builder/${claimedDraftId}`)
  }
  redirect(`/${locale}/dashboard`)
}
