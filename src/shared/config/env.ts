import { z } from 'zod'

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),
  PAYLOAD_SECRET: z.string().min(32, 'PAYLOAD_SECRET must be at least 32 characters'),
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // AI / LLM
  OPENROUTER_API_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),

  // Cache / Queue
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Object Storage
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Payments — CCBill
  CCBILL_ACCOUNT_NUM: z.string().optional(),
  CCBILL_SUBACCOUNT_NUM: z.string().optional(),
  CCBILL_SALT: z.string().optional(),
  CCBILL_WEBHOOK_SECRET: z.string().optional(),

  // Payments — NOWPayments
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // Observability
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
  // Client-side PostHog (NEXT_PUBLIC_ prefix required for browser access)
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  AXIOM_TOKEN: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  if (typeof process !== 'undefined' && process.exit) {
    console.error('Invalid environment variables:')
    console.error(parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
}

export const env = parsed.success ? parsed.data : ({} as z.infer<typeof envSchema>)

export type Env = z.infer<typeof envSchema>
