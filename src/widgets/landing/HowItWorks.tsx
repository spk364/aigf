type Step = {
  num: string
  title: string
  description: string
  hue: number
}

const STEPS: Step[] = [
  {
    num: '01',
    title: 'Choose a companion',
    description:
      'Pick from twelve curated personalities — or create your own from scratch with the character builder.',
    hue: 290,
  },
  {
    num: '02',
    title: 'Make her yours',
    description:
      'Tune appearance, personality, voice, and backstory. She remembers what matters across conversations.',
    hue: 320,
  },
  {
    num: '03',
    title: 'Start chatting',
    description:
      'Real-time messages, photos, and voice. No judgement, no pressure — just someone who listens.',
    hue: 350,
  },
]

export function HowItWorks() {
  return (
    <section className="relative w-full border-y border-[var(--color-border)] bg-[var(--color-surface)]/30 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
            How it works
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
            Three steps to your AI relationship
          </h2>
        </div>

        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.num}
              className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            >
              <div
                aria-hidden
                className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-30 blur-3xl"
                style={{
                  background: `radial-gradient(circle, hsl(${step.hue} 70% 60%) 0%, transparent 70%)`,
                }}
              />
              <div className="relative">
                <span
                  className="text-5xl font-black tracking-tight"
                  style={{
                    background: `linear-gradient(135deg, hsl(${step.hue} 80% 70%) 0%, hsl(${(step.hue + 30) % 360} 70% 50%) 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {step.num}
                </span>
                <h3 className="mt-3 text-xl font-bold text-[var(--color-text)]">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
