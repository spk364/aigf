import { getPayload } from 'payload'
import config from '@payload-config'
import { seedPresetCharacters } from './seed-preset-characters'
import { seedDevUser } from './seed-dev-user'

const TARGETS = new Set(process.argv.slice(2))
const all = TARGETS.size === 0 || TARGETS.has('all')

async function main() {
  const payload = await getPayload({ config })

  if (all || TARGETS.has('characters')) {
    await seedPresetCharacters(payload)
  }

  if (all || TARGETS.has('dev-user')) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[seed] Skipping dev-user in production')
    } else {
      await seedDevUser(payload)
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
