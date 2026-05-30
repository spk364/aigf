import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
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
