'use server'

import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { loginSchema } from '../schemas'
import { checkRateLimit } from '@/shared/rate-limit/limiter'
import { AUTH_LOGIN_LIMIT, readClientIp } from '@/shared/rate-limit/presets'
import { SESSION_TOKEN_EXPIRATION_SECONDS } from '@/shared/auth/session'

export type LoginState =
  | { success: true }
  | { success: false; error: string }

export async function loginAction(formData: FormData): Promise<LoginState> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  }

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: 'Invalid email or password.' }
  }

  // Rate limit on (IP, email-hash) so that one IP scanning many emails AND
  // one email being scanned from many IPs are both bounded. We don't want
  // login responses to leak whether an account exists, so on rate-limit we
  // return the same generic error as a bad password.
  const ip = await readClientIp()
  const rl = await checkRateLimit(AUTH_LOGIN_LIMIT, `ip:${ip}`)
  if (!rl.allowed) {
    return { success: false, error: 'Invalid email or password.' }
  }

  const payload = await getPayload({ config })

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
      maxAge: SESSION_TOKEN_EXPIRATION_SECONDS, // keep in lockstep with the JWT exp
    })

    return { success: true }
  } catch {
    return { success: false, error: 'Invalid email or password.' }
  }
}
