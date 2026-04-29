import 'server-only'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { logger } from '@/shared/lib/logger'

const DEV_USER_EMAIL = 'dev@local.test'

function devBypassActive(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.DEV_AUTH_BYPASS === 'true'
}

let devBypassWarned = false

async function getDevUser() {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'users',
    where: { email: { equals: DEV_USER_EMAIL } },
    limit: 1,
    overrideAccess: true,
  })
  const user = result.docs[0]
  if (!user) {
    if (!devBypassWarned) {
      logger.warn(
        `[dev-auth-bypass] DEV_AUTH_BYPASS=true but ${DEV_USER_EMAIL} not found. Run: pnpm seed:dev`,
      )
      devBypassWarned = true
    }
    return null
  }
  if (!devBypassWarned) {
    logger.warn(
      `[dev-auth-bypass] active — every request resolves as ${DEV_USER_EMAIL}. Disable in production.`,
    )
    devBypassWarned = true
  }
  return user
}

export async function getCurrentUser() {
  if (devBypassActive()) {
    return await getDevUser()
  }
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
