import { getTranslations } from 'next-intl/server'
import { requireCompleteProfile } from '@/shared/auth/require-complete-profile'
import { setNsfwAction } from '@/features/settings/actions'
import {
  SettingsShell,
  SettingsSavedBanner,
  settingsPrimaryBtnClass,
} from '@/widgets/settings/SettingsShell'

type Props = {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ saved?: string }>
}

export default async function ContentSettingsPage({ params, searchParams }: Props) {
  const { locale } = await params
  const { saved } = await searchParams
  const user = await requireCompleteProfile()
  const t = await getTranslations('settings')

  const nsfwEnabled = (user as unknown as { nsfwEnabled?: boolean }).nsfwEnabled ?? false

  return (
    <SettingsShell
      locale={locale}
      active="content"
      navStrings={{
        heading: t('heading'),
        profile: t('nav.profile'),
        content: t('nav.content'),
        account: t('nav.account'),
      }}
      title={t('content.title')}
    >
      {saved && <SettingsSavedBanner message={t('saved')} />}

      <form action={setNsfwAction} className="space-y-5">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <input
            type="checkbox"
            name="nsfwEnabled"
            defaultChecked={nsfwEnabled}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent-strong)]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--color-text)]">
              {t('content.nsfwLabel')}
            </span>
            <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
              {t('content.nsfwHint')}
            </span>
          </span>
        </label>

        <p className="text-xs text-[var(--color-text-muted)]">{t('content.ageNote')}</p>

        <button type="submit" className={settingsPrimaryBtnClass}>
          {t('save')}
        </button>
      </form>
    </SettingsShell>
  )
}
