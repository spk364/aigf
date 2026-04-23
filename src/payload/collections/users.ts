// TODO(phase-3-auth): tighten access control further (rate limiting, admin-only field updates)
// Only grant/spend/refundByAdmin should write to token_balances
import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'
import { ensureBalanceRow } from '@/features/tokens/ledger'

function computeAge(dob: Date): number {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age -= 1
  }
  return age
}

const VERIFY_SUBJECTS: Record<string, string> = {
  en: 'Verify your email address',
  ru: 'Подтверди свой адрес электронной почты',
  es: 'Verifica tu dirección de correo electrónico',
}

const VERIFY_GREETINGS: Record<string, string> = {
  en: 'Please verify your email address by clicking the link below',
  ru: 'Пожалуйста, подтверди свой адрес электронной почты, нажав на ссылку ниже',
  es: 'Verifica tu dirección de correo electrónico haciendo clic en el enlace de abajo',
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    verify: {
      generateEmailSubject: ({ user }) => {
        const locale = (user as { locale?: string }).locale ?? 'en'
        return VERIFY_SUBJECTS[locale] ?? VERIFY_SUBJECTS['en']!
      },
      generateEmailHTML: ({ req, token, user }) => {
        const locale =
          (req?.user as { locale?: string } | null)?.locale ??
          (user as { locale?: string }).locale ??
          'en'
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
        const url = `${appUrl}/${locale}/verify-email?token=${token}`
        const greeting = VERIFY_GREETINGS[locale] ?? VERIFY_GREETINGS['en']!
        const email = (user as { email?: string }).email ?? ''
        return `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a;">
  <h2>AI Companion</h2>
  <p>${greeting}:</p>
  <p><a href="${url}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;border-radius:6px;text-decoration:none;">Verify Email</a></p>
  <p style="color:#666;font-size:12px;">If you did not create an account, ignore this email.<br>Sent to: ${email}</p>
</body>
</html>`
      },
    },
    loginWithUsername: false,
  },
  timestamps: true,
  admin: {
    useAsTitle: 'email',
  },
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if ((user as { roles?: string[] }).roles?.includes('admin')) return true
      return { id: { equals: user.id } }
    },
    create: () => true,
    update: ({ req: { user } }) => {
      if (!user) return false
      if ((user as { roles?: string[] }).roles?.includes('admin')) return true
      return { id: { equals: user.id } }
    },
    delete: () => true,
  },
  hooks: {
    beforeValidate: [
      async ({ data }) => {
        // Run on both create and update so DOB edits are also age-checked
        const dob = data?.dateOfBirth
        // If no DOB provided, allow (OAuth users complete profile later)
        if (!dob) return data
        const dobDate = new Date(dob as string)
        if (isNaN(dobDate.getTime())) return data
        const age = computeAge(dobDate)
        if (age < 18) {
          throw new ValidationError({
            errors: [
              {
                message: 'underage',
                path: 'dateOfBirth',
              },
            ],
          })
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return doc
        const payload = req.payload
        if (!payload) return doc

        const headers = req.headers as Headers | undefined
        const ip =
          headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ??
          headers?.get('x-real-ip') ??
          'unknown'
        const userAgent = headers?.get('user-agent') ?? 'unknown'

        // Only write age-verification row if DOB is present at creation time.
        // OAuth users (googleId set, dateOfBirth null) skip this — the
        // complete-profile action writes its own row when DOB is provided.
        if (doc.dateOfBirth) {
          try {
            await payload.create({
              collection: 'age-verifications',
              data: {
                userId: doc.id as string,
                method: 'self_declaration',
                verifiedAt: new Date().toISOString(),
                ipAddress: ip,
                userAgent: userAgent,
                dateOfBirthProvided: doc.dateOfBirth as string,
              },
              overrideAccess: true,
            })
          } catch {
            // Non-blocking — audit log failure must not block registration
            payload.logger.error({ msg: 'Failed to write age-verification audit log', userId: doc.id })
          }
        }

        try {
          await ensureBalanceRow(payload, doc.id as string)
        } catch (err) {
          payload.logger.error({
            msg: 'Failed to create token_balance row',
            userId: doc.id,
            err: err instanceof Error ? { message: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') } : err,
          })
        }

        return doc
      },
    ],
  },
  indexes: [
    { fields: ['status', 'deletedAt'] },
    { fields: ['lastActiveAt'] },
  ],
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['user'],
      options: [
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
      ],
    },
    {
      name: 'emailVerified',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'emailVerifiedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'googleId',
      type: 'text',
      unique: true,
      index: true,
    },
    {
      name: 'displayName',
      type: 'text',
    },
    {
      name: 'avatarUrl',
      type: 'text',
    },
    {
      name: 'timezone',
      type: 'text',
    },
    {
      name: 'locale',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Russian', value: 'ru' },
        { label: 'Spanish', value: 'es' },
      ],
    },
    {
      name: 'preferredLanguage',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Russian', value: 'ru' },
        { label: 'Spanish', value: 'es' },
        { label: 'Auto', value: 'auto' },
      ],
    },
    {
      name: 'dateOfBirth',
      type: 'date',
      // Not required at DB/field level — OAuth users provide DOB via
      // the complete-profile flow. Email+password signup enforces DOB
      // at the form/Zod-schema level (see src/features/auth/schemas.ts).
      required: false,
    },
    {
      name: 'ageVerifiedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'ageVerificationMethod',
      type: 'select',
      options: [
        { label: 'Self Declaration', value: 'self_declaration' },
        { label: 'ID Check', value: 'id_check' },
      ],
    },
    {
      name: 'nsfwEnabled',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'nsfwEnabledAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Suspended', value: 'suspended' },
        { label: 'Banned', value: 'banned' },
        { label: 'Deleted', value: 'deleted' },
      ],
      index: true,
    },
    {
      name: 'suspensionReason',
      type: 'text',
    },
    {
      name: 'suspendedUntil',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'lastActiveAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'deletedAt',
      type: 'date',
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'totalMessagesCount',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'charactersCreatedCount',
      type: 'number',
      defaultValue: 0,
    },
  ],
}
