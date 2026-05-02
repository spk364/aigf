'use server'

import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { signupSchema } from '../schemas'
import { track } from '@/shared/analytics/posthog'
import { claimGuestDraftForUser } from '@/features/builder/guest-claim'

export type SignupState =
  | { success: true; claimedDraftId?: string }
  | { success: false; error: string; field?: string }

export async function signupAction(formData: FormData): Promise<SignupState> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    displayName: formData.get('displayName') || undefined,
    dateOfBirth: formData.get('dateOfBirth'),
    agreeToTerms: formData.get('agreeToTerms') === 'true' ? (true as const) : undefined,
    subscribeNewsletter: formData.get('subscribeNewsletter') === 'on',
  }

  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const message = firstIssue?.message ?? 'Invalid input'
    const field = firstIssue?.path[0]?.toString()
    return { success: false, error: message, field }
  }

  const payload = await getPayload({ config })

  let createdUserId: string | undefined
  try {
    const newUser = await payload.create({
      collection: 'users',
      data: {
        email: parsed.data.email,
        password: parsed.data.password,
        displayName: parsed.data.displayName ?? '',
        dateOfBirth: parsed.data.dateOfBirth,
      },
    })
    createdUserId = String(newUser.id)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
      return { success: false, error: 'emailTaken', field: 'email' }
    }
    if (msg === 'underage') {
      return { success: false, error: 'underage', field: 'dateOfBirth' }
    }
    return { success: false, error: 'Registration failed. Please try again.' }
  }

  if (createdUserId) {
    track({
      userId: createdUserId,
      event: 'user.signed_up',
      properties: {
        locale: undefined, // locale not available in server action context
        hasDisplayName: !!parsed.data.displayName,
      },
    })
  }

  // Auto-login after registration
  try {
    const result = await payload.login({
      collection: 'users',
      data: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
    })

    const cookieStore = await cookies()
    cookieStore.set('payload-token', result.token ?? '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
  } catch {
    // If auto-login fails, user can still log in manually
  }

  // Adopt any guest builder draft from the pre-signup teaser flow.
  let claimedDraftId: string | undefined
  if (createdUserId) {
    try {
      const claim = await claimGuestDraftForUser(createdUserId)
      if (claim.claimed) {
        claimedDraftId = claim.draftId
        track({
          userId: createdUserId,
          event: 'builder.guest_draft_claimed',
          properties: { draftId: claim.draftId },
        })
      }
    } catch {
      // Non-blocking — signup must succeed even if claim fails.
    }
  }

  return { success: true, claimedDraftId }
}
