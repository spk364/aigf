import { getPayload } from 'payload'
import config from '@payload-config'
import { seedPresetCharacters } from './seed-preset-characters'

async function main() {
  const payload = await getPayload({ config })
  await seedPresetCharacters(payload)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
