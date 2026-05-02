'use server'

import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../test-login-config'

export async function loginAsTestUserAction(): Promise<{ success: boolean; error?: string }> {
  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: TEST_USER_EMAIL } },
    limit: 1,
    overrideAccess: true,
  })

  if (existing.docs.length === 0) {
    const now = new Date().toISOString()
    await payload.create({
      collection: 'users',
      data: {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        roles: ['user'],
        emailVerified: true,
        emailVerifiedAt: now,
        displayName: 'Demo User',
        locale: 'en',
        preferredLanguage: 'auto',
        dateOfBirth: '1995-01-01T00:00:00.000Z',
        ageVerifiedAt: now,
        ageVerificationMethod: 'self_declaration',
        nsfwEnabled: true,
        nsfwEnabledAt: now,
        status: 'active',
        _verified: true,
      } as never,
      overrideAccess: true,
    })
  }

  try {
    const result = await payload.login({
      collection: 'users',
      data: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
    })

    const cookieStore = await cookies()
    cookieStore.set('payload-token', result.token ?? '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })

    return { success: true }
  } catch {
    return { success: false, error: 'Test login failed.' }
  }
}
