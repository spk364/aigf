import { getPayload } from 'payload'
import config from '@payload-config'
import { validateBalances } from './validator'

async function main() {
  const payload = await getPayload({ config })
  const result = await validateBalances(payload)

  if (result.ok) {
    console.log('All token balances are consistent.')
    process.exit(0)
  } else {
    console.error(`Found ${result.discrepancies.length} discrepancies:`)
    for (const d of result.discrepancies) {
      console.error(`  userId=${d.userId} cached=${d.cached} expected=${d.expected}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
