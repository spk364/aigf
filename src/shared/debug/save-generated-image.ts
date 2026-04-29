import 'server-only'
import fs from 'fs/promises'
import path from 'path'

// Saves generated images to ./generated-images/ for dev inspection.
// Filename: {timestamp}-{model}-{WxH}.{ext}
// No-op outside development and on any error.
export async function saveGeneratedImageToDisk(opts: {
  imageUrl: string
  model: string
  width: number
  height: number
  kind?: string
}): Promise<string | null> {
  if (process.env.NODE_ENV !== 'development') return null
  try {
    const res = await fetch(opts.imageUrl)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())

    const contentType = res.headers.get('content-type') ?? ''
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'

    const modelSlug = opts.model
      .replace(/^fal-ai\//, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .slice(0, 40)

    const kindPrefix = opts.kind ? `${opts.kind}-` : ''
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `${ts}-${kindPrefix}${modelSlug}-${opts.width}x${opts.height}.${ext}`

    const dir = path.join(process.cwd(), 'generated-images')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, filename), buf)
    return `generated-images/${filename}`
  } catch {
    return null
  }
}
