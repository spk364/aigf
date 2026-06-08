import { getPayload } from 'payload'
import config from '@payload-config'
import { seedPresetCharacters, seedExtraCharacters } from './seed-preset-characters'
import { seedPresetBoys } from './seed-preset-boys'
import { seedDevUser } from './seed-dev-user'
import { seedTokenPackages } from './seed-token-packages'

const TARGETS = new Set(process.argv.slice(2))
const all = TARGETS.size === 0 || TARGETS.has('all')

async function main() {
  const payload = await getPayload({ config })

  if (all || TARGETS.has('characters')) {
    await seedPresetCharacters(payload)
  }

  // Extras-only: create the additional personas without re-upserting the base
  // catalog. Use on live deployments. `all` does NOT include this.
  if (TARGETS.has('characters-extra')) {
    await seedExtraCharacters(payload)
  }

  if (all || TARGETS.has('boys')) {
    await seedPresetBoys(payload)
  }

  if (all || TARGETS.has('token-packages')) {
    await seedTokenPackages(payload)
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
