import { type CSSProperties } from 'react'

type Avatar = {
  id: string
  name: string
  hue: number
}

const NAMES = [
  'Aria',
  'Luna',
  'Mia',
  'Zoe',
  'Eva',
  'Nia',
  'Ivy',
  'Sky',
  'Ada',
  'Lia',
  'Noa',
  'Sia',
  'Lea',
  'Vio',
  'Ari',
  'Kai',
  'Rin',
  'Yua',
  'Emi',
  'Sun',
  'Ros',
  'Joy',
  'Tia',
  'Pia',
  'Jin',
  'Mei',
  'Ana',
  'Bea',
  'Cleo',
  'Dia',
  'Esa',
  'Fae',
  'Gia',
  'Hana',
  'Ila',
  'Juno',
]

function buildAvatars(count: number, columnIndex: number): Avatar[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = columnIndex * 13 + i * 7
    const name = NAMES[(seed * 3) % NAMES.length] ?? 'A'
    const hue = (seed * 47) % 360
    return {
      id: `${columnIndex}-${i}`,
      name,
      hue,
    }
  })
}

const COLUMN_COUNT = 6
const AVATARS_PER_COLUMN = 8

function AvatarTile({ avatar }: { avatar: Avatar }) {
  const { name, hue } = avatar
  const initial = name.charAt(0)
  const style: CSSProperties = {
    background: `linear-gradient(135deg, hsl(${hue} 70% 55%) 0%, hsl(${(hue + 40) % 360} 60% 35%) 60%, hsl(${(hue + 80) % 360} 55% 25%) 100%)`,
  }
  return (
    <div
      className="relative flex aspect-[3/4] w-full items-end overflow-hidden rounded-2xl border border-white/5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      style={style}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />
      <div
        className="pointer-events-none absolute right-3 top-3 flex h-2.5 w-2.5 items-center justify-center"
        title="online"
      >
        <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400/60" />
        <span className="relative h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-black/30" />
      </div>
      <div className="relative z-10 flex w-full items-end justify-between p-3">
        <span className="text-sm font-semibold tracking-tight text-white drop-shadow-sm">
          {name}
        </span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-xs font-bold uppercase text-white/90 backdrop-blur-sm">
          {initial}
        </span>
      </div>
    </div>
  )
}

function AvatarColumn({
  columnIndex,
  direction,
  duration,
  visibility,
}: {
  columnIndex: number
  direction: 'up' | 'down'
  duration: number
  visibility: string
}) {
  const avatars = buildAvatars(AVATARS_PER_COLUMN, columnIndex)
  const animationName =
    direction === 'up' ? 'avatar-grid-scroll-up' : 'avatar-grid-scroll-down'

  return (
    <div className={`relative w-full flex-col ${visibility}`}>
      <div
        className="avatar-grid-column-track flex flex-col gap-3 sm:gap-4"
        style={{
          animationName,
          animationDuration: `${duration}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
          willChange: 'transform',
        }}
      >
        {avatars.map((a) => (
          <AvatarTile key={a.id} avatar={a} />
        ))}
        {avatars.map((a) => (
          <AvatarTile key={`${a.id}-dup`} avatar={a} />
        ))}
      </div>
    </div>
  )
}

const COLUMN_VISIBILITY = [
  'flex',
  'flex',
  'flex',
  'hidden sm:flex',
  'hidden md:flex',
  'hidden lg:flex',
]

export function AvatarGrid() {
  const columns = Array.from({ length: COLUMN_COUNT }, (_, i) => ({
    index: i,
    direction: (i % 2 === 0 ? 'up' : 'down') as 'up' | 'down',
    duration: 60 + (i % 3) * 15,
    visibility: COLUMN_VISIBILITY[i] ?? 'flex',
  }))

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <style>{`
        @keyframes avatar-grid-scroll-up {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes avatar-grid-scroll-down {
          0% { transform: translateY(-50%); }
          100% { transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .avatar-grid-column-track {
            animation: none !important;
          }
        }
      `}</style>

      <div className="absolute inset-0 grid grid-cols-3 gap-3 px-3 sm:grid-cols-4 sm:gap-4 sm:px-6 md:grid-cols-5 lg:grid-cols-6 lg:gap-5">
        {columns.map((col) => (
          <AvatarColumn
            key={col.index}
            columnIndex={col.index}
            direction={col.direction}
            duration={col.duration}
            visibility={col.visibility}
          />
        ))}
      </div>

      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(11, 10, 16, 0.55) 0%, rgba(11, 10, 16, 0.85) 55%, rgba(11, 10, 16, 0.97) 100%)',
        }}
      />

      <div
        className="absolute inset-x-0 top-0 h-32"
        style={{
          background:
            'linear-gradient(to bottom, var(--color-bg) 0%, rgba(11, 10, 16, 0) 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-32"
        style={{
          background:
            'linear-gradient(to top, var(--color-bg) 0%, rgba(11, 10, 16, 0) 100%)',
        }}
      />
    </div>
  )
}
