// One-off generator for the PWA / home-screen icon set.
//
// Renders a font-independent brand mark (gradient rounded square + heart glyph,
// matching the in-app logo) to PNGs under public/icons. Re-run after a brand
// colour change:  node scripts/generate-pwa-icons.mjs
//
// Vector glyph (no <text>) keeps rasterisation independent of system fonts.

import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'public', 'icons')

// Theme colours — keep in sync with src/app/(app)/globals.css.
const BG = '#0b0a10'
const ACCENT = '#e9a6ff'
const ACCENT_STRONG = '#c074ff'

// Heart path on a 0 0 24 24 canvas (visual centre ≈ 12, 12.9).
const HEART =
  'M12 21s-7-4.35-9.5-9.13C.93 8.45 2.6 4.86 5.84 4.86c1.95 0 3.42 1.1 4.16 2.58.74-1.48 2.21-2.58 4.16-2.58 3.24 0 4.91 3.59 3.34 7.01C19 16.65 12 21 12 21z'

function iconSvg(size, { maskable = false } = {}) {
  // Maskable icons are full-bleed (the launcher applies its own mask) and keep
  // the glyph inside the 80% safe area; regular icons get a rounded square.
  const rx = maskable ? 0 : 24 * 0.22
  const scale = maskable ? 0.5 : 0.62
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT_STRONG}"/>
    </linearGradient>
  </defs>
  <rect width="24" height="24" rx="${rx}" ry="${rx}" fill="url(#g)"/>
  <path d="${HEART}" fill="${BG}"
    transform="translate(12 12.9) scale(${scale}) translate(-12 -12.9)"/>
</svg>`
}

async function render(svg, size, file) {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(OUT, file))
  console.log('wrote', file)
}

await mkdir(OUT, { recursive: true })
await render(iconSvg(192), 192, 'icon-192.png')
await render(iconSvg(512), 512, 'icon-512.png')
await render(iconSvg(512, { maskable: true }), 512, 'maskable-512.png')
await render(iconSvg(180, { maskable: true }), 180, 'apple-touch-icon.png')
await render(iconSvg(32), 32, 'favicon-32.png')
console.log('PWA icons generated in public/icons')
