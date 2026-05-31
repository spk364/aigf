import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { getBalance } from '@/features/tokens/ledger'
import { updateProfileAction } from '@/features/settings/actions'
import {
  SettingsShell,
  SettingsSavedBanner,
  settingsInputClass,
  settingsLabelClass,
  settingsPrimaryBtnClass,
} from '@/widgets/settings/SettingsShell'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ saved?: string }>
}

export default async function ProfileSettingsPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { saved } = await searchParams
  const user = await requireCompleteProfile()
  const t = await getTranslations('settings')

  const displayName = (user as unknown as { displayName?: string | null }).displayName ?? ''
  const userLocale = (user as unknown as { locale?: string | null }).locale ?? locale

  const payload = await getPayload({ config })
  const balance = await getBalance(payload, user.id)

  return (
    <SettingsShell
      locale={locale}
      active="profile"
      navStrings={{
        heading: t('heading'),
        profile: t('nav.profile'),
        content: t('nav.content'),
        account: t('nav.account'),
      }}
      title={t('profile.title')}
    >
      {saved && <SettingsSavedBanner message={t('saved')} />}

      {/* Token balance + top-up link */}
      <div className="mb-6 flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-3">
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">{t('profile.tokenBalance')}</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{balance.toLocaleString()}</p>
        </div>
        <Link
          href={`/${locale}/plans`}
          className="rounded-xl bg-[var(--color-accent-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)]"
        >
          {t('profile.getMore')}
        </Link>
      </div>

      <form action={updateProfileAction} className="space-y-5">
        <div>
          <label htmlFor="email" className={settingsLabelClass}>
            {t('profile.email')}
          </label>
          <input
            id="email"
            type="email"
            value={user.email}
            disabled
            className={`${settingsInputClass} opacity-60`}
          />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('profile.emailHint')}</p>
        </div>

        <div>
          <label htmlFor="displayName" className={settingsLabelClass}>
            {t('profile.displayName')}
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            maxLength={50}
            defaultValue={displayName}
            placeholder={t('profile.displayNamePlaceholder')}
            className={settingsInputClass}
          />
        </div>

        <div>
          <label htmlFor="locale" className={settingsLabelClass}>
            {t('profile.language')}
          </label>
          <select
            id="locale"
            name="locale"
            defaultValue={userLocale}
            className={settingsInputClass}
          >
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="es">Español</option>
          </select>
        </div>

        <button type="submit" className={settingsPrimaryBtnClass}>
          {t('save')}
        </button>
      </form>
    </SettingsShell>
  )
}
