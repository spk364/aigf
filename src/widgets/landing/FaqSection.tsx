type Faq = {
  q: string
  a: string
}

const FAQS: Faq[] = [
  {
    q: 'Is this a real person?',
    a: 'No. Every companion is an AI character. They will never claim to be human, and you should never treat their messages as real-life advice.',
  },
  {
    q: 'Are my conversations private?',
    a: 'Yes. Conversations are stored encrypted on our servers and never shared with third parties. You can delete any conversation at any time.',
  },
  {
    q: 'Can I create my own companion?',
    a: 'Yes. The character builder lets you tune appearance, personality, voice, occupation, backstory, and even pet names. Create as many as your plan allows.',
  },
  {
    q: 'Do they remember our conversations?',
    a: 'On the Free plan, companions remember the current conversation. On Premium, they keep long-term memory across sessions and recall details across days, weeks, and months.',
  },
  {
    q: 'Is there explicit content?',
    a: 'All companions are SFW by default and are designed to be warm and romantic, not explicit. We do not allow underage content under any circumstances.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your billing page in one click. Your subscription remains active until the end of the billing cycle.',
  },
]

export function FaqSection() {
  return (
    <section className="relative w-full border-t border-[var(--color-border)] bg-[var(--color-surface)]/30 py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
            FAQ
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
            Frequently asked questions
          </h2>
        </div>
        <ul className="space-y-3">
          {FAQS.map((faq) => (
            <li key={faq.q}>
              <details className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 transition-colors open:border-[var(--color-accent-strong)]/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5 shrink-0 text-[var(--color-text-muted)] transition-transform group-open:rotate-45"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 4.75a.75.75 0 01.75.75v3.75h3.75a.75.75 0 010 1.5h-3.75v3.75a.75.75 0 01-1.5 0v-3.75H5.5a.75.75 0 010-1.5h3.75V5.5a.75.75 0 01.75-.75z"
                      clipRule="evenodd"
                    />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
                  {faq.a}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
