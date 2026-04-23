import 'server-only'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { logger } from '@/shared/lib/logger'

export async function getCurrentUser() {
  try {
    const payload = await getPayload({ config })
    const headersList = await getHeaders()
    const { user } = await payload.auth({ headers: headersList })
    return user ?? null
  } catch (err) {
    logger.warn({ err }, 'getCurrentUser failed — treating as unauthenticated')
    return null
  }
}
