import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { changePasswordAction, deleteAccountAction } from '@/features/settings/actions'
import {
  SettingsShell,
  SettingsSavedBanner,
  SettingsErrorBanner,
  settingsInputClass,
  settingsLabelClass,
  settingsPrimaryBtnClass,
} from '@/widgets/settings/SettingsShell'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ saved?: string; error?: string }>
}

export default async function AccountSettingsPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { saved, error } = await searchParams
  const user = await requireCompleteProfile()
  const t = await getTranslations('settings')

  // OAuth-only accounts (Google) have a googleId and typically no password —
  // hide the change-password form and point them to reset-by-email instead.
  const hasGoogle = !!(user as unknown as { googleId?: string }).googleId

  const errorMessage = (() => {
    if (!error) return null
    const map: Record<string, string> = {
      weak: t('account.errors.weak'),
      mismatch: t('account.errors.mismatch'),
      current_required: t('account.errors.currentRequired'),
      wrong_current: t('account.errors.wrongCurrent'),
      confirm: t('account.errors.confirm'),
    }
    return map[error] ?? error
  })()

  return (
    <SettingsShell
      locale={locale}
      active="account"
      navStrings={{
        heading: t('heading'),
        profile: t('nav.profile'),
        content: t('nav.content'),
        account: t('nav.account'),
      }}
      title={t('account.title')}
    >
      {saved === 'password' && <SettingsSavedBanner message={t('account.passwordSaved')} />}
      {errorMessage && <SettingsErrorBanner message={errorMessage} />}

      {/* Change password */}
      <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-5">
        <h3 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
          {t('account.changePassword')}
        </h3>
        {hasGoogle ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('account.googleManaged')}</p>
        ) : (
          <form action={changePasswordAction} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className={settingsLabelClass}>
                {t('account.currentPassword')}
              </label>
              <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" className={settingsInputClass} />
            </div>
            <div>
              <label htmlFor="newPassword" className={settingsLabelClass}>
                {t('account.newPassword')}
              </label>
              <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} className={settingsInputClass} />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('account.passwordHint')}</p>
            </div>
            <div>
              <label htmlFor="confirmPassword" className={settingsLabelClass}>
                {t('account.confirmPassword')}
              </label>
              <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" className={settingsInputClass} />
            </div>
            <button type="submit" className={settingsPrimaryBtnClass}>
              {t('account.updatePassword')}
            </button>
          </form>
        )}
      </div>

      {/* Danger zone — delete account */}
      <div className="rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-5">
        <h3 className="mb-1 text-sm font-semibold text-[var(--color-danger)]">
          {t('account.deleteTitle')}
        </h3>
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">{t('account.deleteHint')}</p>
        <form action={deleteAccountAction} className="space-y-3">
          <div>
            <label htmlFor="confirm" className={settingsLabelClass}>
              {t('account.deleteConfirmLabel')}
            </label>
            <input
              id="confirm"
              name="confirm"
              type="text"
              placeholder="DELETE"
              autoComplete="off"
              className={`${settingsInputClass} max-w-xs`}
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/20"
          >
            {t('account.deleteButton')}
          </button>
        </form>
      </div>
    </SettingsShell>
  )
}
