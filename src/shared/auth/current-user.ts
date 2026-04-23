import 'server-only'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { logger } from '@/shared/lib/logger'

export async function getCurrentUser() {
  try {
    const payload = await getPayload({ config })
    const headersList = await getHeaders()
    const cookieHeader = headersList.get('cookie') ?? ''
    const cookieNames = cookieHeader.split(';').map((c) => c.trim().split('=')[0]).filter(Boolean)
    const { user } = await payload.auth({ headers: headersList })
    console.log('[auth] getCurrentUser', { hasCookie: !!cookieHeader, cookieNames, userFound: !!user, userId: user?.id })
    return user ?? null
  } catch (err) {
    logger.warn({ err }, 'getCurrentUser failed — treating as unauthenticated')
    return null
  }
}
