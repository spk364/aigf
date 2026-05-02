import { type CSSProperties } from 'react'
import {
  BODY_OPTIONS,
  EYE_COLOR_OPTIONS,
  HAIR_COLOR_OPTIONS,
  PERSONALITY_OPTIONS,
  STYLE_OPTIONS,
  type OnboardingChoices,
} from './data'

type Props = {
  choices: OnboardingChoices
  size?: 'sm' | 'md' | 'lg'
}

function findOption<T extends { value: string }>(
  list: T[],
  value: string | undefined,
): T | undefined {
  return value ? list.find((o) => o.value === value) : undefined
}

export function CompanionPreview({ choices, size = 'md' }: Props) {
  const style = findOption(STYLE_OPTIONS, choices.style)
  const body = findOption(BODY_OPTIONS, choices.body)
  const hair = findOption(HAIR_COLOR_OPTIONS, choices.hairColor)
  const eyes = findOption(EYE_COLOR_OPTIONS, choices.eyeColor)
  const personality = findOption(PERSONALITY_OPTIONS, choices.personality)

  const hueA =
    (personality?.hue ?? body?.hue ?? style?.hue ?? 290)
  const hueB = (hair?.hue ?? hueA + 40) % 360
  const hueC = (eyes?.hue ?? hueB + 40) % 360

  const containerStyle: CSSProperties = {
    background: `linear-gradient(155deg, hsl(${hueA} 70% 55%) 0%, hsl(${hueB} 60% 38%) 55%, hsl(${hueC} 55% 22%) 100%)`,
  }

  const sizeClass =
    size === 'sm' ? 'aspect-[3/4] w-40' : size === 'lg' ? 'aspect-[3/4] w-72' : 'aspect-[3/4] w-56'

  const initial = choices.name ? choices.name.charAt(0).toUpperCase() : '?'

  return (
    <div
      className={`relative ${sizeClass} overflow-hidden rounded-3xl border border-white/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]`}
      style={containerStyle}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 50%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-7xl font-black text-white/20">{initial}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-2xl font-bold text-white drop-shadow">
          {choices.name || 'Your companion'}
        </p>
        {personality && (
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-widest text-white/80">
            {personality.label}
          </p>
        )}
      </div>
    </div>
  )
}
