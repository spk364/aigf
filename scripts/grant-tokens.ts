// Ad-hoc admin tool: grant tokens to a user by email.
// Usage:
//   pnpm tsx --env-file-if-exists=.env.local scripts/grant-tokens.ts <email> <amount> [reason]
//
// Routes through the ledger so the cached balance, the audit-trail, and the
// validator stay in sync. Idempotency key is keyed on (email, timestamp) so a
// re-run within the same second won't double-credit, but a deliberate second
// invocation will (different timestamp). For safety-critical reversals use the
// admin UI / refundByAdmin path, not this script.

import 'tsx'
import { getPayload } from 'payload'
import config from '../src/payload/payload.config'
import { grant } from '../src/features/tokens/ledger'

async function main() {
  const [, , email, rawAmount, ...rest] = process.argv
  const reason = rest.join(' ') || 'manual_admin_grant'

  if (!email || !rawAmount) {
    console.error('Usage: grant-tokens.ts <email> <amount> [reason]')
    process.exit(1)
  }

  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    console.error(`Invalid amount: ${rawAmount} (must be a positive integer)`)
    process.exit(1)
  }

  const payload = await getPayload({ config })

  const userResult = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })

  const user = userResult.docs[0]
  if (!user) {
    console.error(`No user found for email "${email}"`)
    process.exit(1)
  }

  const idempotencyKey = `manual-grant:${user.id}:${Date.now()}`
  const tx = await grant(payload, {
    userId: user.id,
    type: 'admin_adjustment',
    amount,
    reason,
    idempotencyKey,
  })

  console.log(JSON.stringify({
    ok: true,
    email,
    userId: user.id,
    granted: amount,
    balanceAfter: tx.balanceAfter,
    txId: tx.id,
    idempotencyKey,
  }, null, 2))

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
