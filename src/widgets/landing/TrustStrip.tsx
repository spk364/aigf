type Item = {
  label: string
  value: string
}

const ITEMS: Item[] = [
  { value: '12+', label: 'Curated companions' },
  { value: '24/7', label: 'Always available' },
  { value: '∞', label: 'Custom characters' },
  { value: '🔒', label: 'Private & encrypted' },
]

export function TrustStrip() {
  return (
    <section className="relative w-full border-y border-[var(--color-border)] bg-[var(--color-bg)]">
      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
        {ITEMS.map((item) => (
          <li
            key={item.label}
            className="flex flex-col items-center gap-1 bg-[var(--color-bg)] px-6 py-8 text-center"
          >
            <span className="text-3xl font-bold text-[var(--color-text)]">{item.value}</span>
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
