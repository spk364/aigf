import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { resendAdapter } from '@payloadcms/email-resend'
import { en } from '@payloadcms/translations/languages/en'
import { ru } from '@payloadcms/translations/languages/ru'
import { es } from '@payloadcms/translations/languages/es'
import { OAuth2Plugin } from 'payload-oauth2'
import { Users } from './collections/users'
import { AgeVerifications } from './collections/age-verifications'
import { Characters } from './collections/characters'
import { MediaAssets } from './collections/media-assets'
import { Conversations } from './collections/conversations'
import { Messages } from './collections/messages'
import { Subscriptions } from './collections/subscriptions'
import { TokenBalances } from './collections/token-balances'
import { TokenTransactions } from './collections/token-transactions'
import { TokenPackages } from './collections/token-packages'
import { PaymentTransactions } from './collections/payment-transactions'
import { PaymentWebhooks } from './collections/payment-webhooks'
import { SystemPrompts } from './collections/system-prompts'
import { FeatureFlags } from './collections/feature-flags'
import { AuditLogs } from './collections/audit-logs'
import { CharacterDrafts } from './collections/character-drafts'
import { MemoryEntries } from './collections/memory-entries'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const googleOAuthEnabled =
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

const googleOAuthPlugin = OAuth2Plugin({
  enabled: googleOAuthEnabled,
  strategyName: 'google',
  useEmailAsIdentity: true,
  serverURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  authCollection: 'users',
  // We store the Google sub in the googleId field
  subFieldName: 'googleId',
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  providerAuthorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  authorizePath: '/oauth/authorize',
  callbackPath: '/oauth/callback',
  scopes: ['openid', 'email', 'profile'],
  getUserInfo: async (accessToken: string) => {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) {
      const body = await resp.text()
      console.error('[oauth] google userinfo failed:', resp.status, body)
      throw new Error(`Google userinfo failed: ${resp.status}`)
    }
    const data = (await resp.json()) as {
      sub: string
      email: string
      name?: string
      picture?: string
    }
    console.log('[oauth] google userinfo ok:', { email: data.email, sub: data.sub })
    const now = new Date().toISOString()
    return {
      email: data.email,
      googleId: data.sub,
      displayName: data.name ?? '',
      avatarUrl: data.picture ?? '',
      emailVerified: true,
      emailVerifiedAt: now,
      // Payload's internal flag — required when collection has `auth.verify: true`
      // Without this, newly-created OAuth users can't log in ("Email not verified")
      _verified: true,
    }
  },
  successRedirect: (req) => {
    const user = req.user as { locale?: string } | null
    const locale = user?.locale ?? 'en'
    return `/${locale}/dashboard`
  },
  failureRedirect: (req, err) => {
    const user = req.user as { locale?: string } | null
    const locale = user?.locale ?? 'en'
    const e = err as { message?: string; name?: string; data?: unknown; stack?: string } | undefined
    console.error('[oauth] callback failed:', {
      name: e?.name,
      message: e?.message,
      data: e?.data,
      stack: e?.stack?.split('\n').slice(0, 6).join('\n'),
    })
    return `/${locale}/login?oauth_error=true`
  },
})

const serverURL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? '',
  serverURL,
  csrf: [serverURL],
  cors: [serverURL],

  // Only wire Resend when a real key is present.
  // With an empty key the adapter still POSTs to Resend and gets 401, which
  // breaks any flow that touches Payload's verification email path (incl. OAuth).
  ...(process.env.RESEND_API_KEY
    ? {
        email: resendAdapter({
          defaultFromAddress: 'noreply@aicompanion.local',
          defaultFromName: 'AI Companion',
          apiKey: process.env.RESEND_API_KEY,
        }),
      }
    : {}),

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
  }),

  editor: lexicalEditor(),

  collections: [
    Users,
    AgeVerifications,
    Characters,
    CharacterDrafts,
    MediaAssets,
    Conversations,
    Messages,
    Subscriptions,
    TokenBalances,
    TokenTransactions,
    TokenPackages,
    PaymentTransactions,
    PaymentWebhooks,
    SystemPrompts,
    FeatureFlags,
    AuditLogs,
    MemoryEntries,
  ],

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  admin: {
    importMap: {
      baseDir: path.resolve(dirname, '../app/(payload)'),
    },
  },

  localization: {
    locales: [
      { label: 'English', code: 'en' },
      { label: 'Russian', code: 'ru' },
      { label: 'Spanish', code: 'es' },
    ],
    defaultLocale: 'en',
    fallback: true,
  },

  i18n: {
    supportedLanguages: { en, ru, es },
  },

  plugins: [googleOAuthPlugin],
})
