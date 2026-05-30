import { SettingsNav, type SettingsTab, type SettingsNavStrings } from './SettingsNav'

type Props = {
  locale: string
  active: SettingsTab
  navStrings: SettingsNavStrings
  title: string
  children: React.ReactNode
}

// Two-column settings shell: nav rail on the left (desktop) / scrollable row on
// top (mobile), content on the right. Rendered inside SettingsLayout's
// DashboardShell, so the outer app sidebar stays in place.
export function SettingsShell({ locale, active, navStrings, title, children }: Props) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
      <aside className="sm:w-52 sm:shrink-0">
        <h1 className="mb-4 px-1 text-xl font-bold text-[var(--color-text)]">{navStrings.heading}</h1>
        <SettingsNav locale={locale} active={active} strings={navStrings} />
      </aside>
      <section className="min-w-0 flex-1">
        <h2 className="mb-5 text-lg font-semibold text-[var(--color-text)]">{title}</h2>
        {children}
      </section>
    </div>
  )
}

// Shared input / label / button classes so the three pages stay visually
// consistent without re-declaring Tailwind strings.
export const settingsInputClass =
  'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50 outline-none transition-colors focus:border-[var(--color-accent-strong)] focus:ring-1 focus:ring-[var(--color-accent-strong)] [color-scheme:dark]'

export const settingsLabelClass = 'mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]'

export const settingsPrimaryBtnClass =
  'inline-flex items-center justify-center rounded-xl bg-[var(--color-accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent)] disabled:opacity-50'

export function SettingsSavedBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
    >
      {message}
    </div>
  )
}

export function SettingsErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-5 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-3 text-sm text-[var(--color-danger)]"
    >
      {message}
    </div>
  )
}
