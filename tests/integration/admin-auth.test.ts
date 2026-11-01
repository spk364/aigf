// Admins vs. site customers against the real database: who /admin and
// /api/admin/* let in. Uses a throwaway admin and a throwaway customer with
// random passwords and hard-deletes both afterwards.
import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { getPayload, type BasePayload } from 'payload'
import config from '@payload-config'

// Payload only trusts the auth cookie on a request that looks same-origin
// (csrf is configured), the way a browser sends it.
const { cookie, browserHeaders } = vi.hoisted(() => ({
  cookie: { value: '' },
  browserHeaders: (c: string) =>
    new Headers({ 'sec-fetch-site': 'same-origin', ...(c ? { cookie: c } : {}) }),
}))
vi.mock('next/headers', () => ({
  headers: async () => browserHeaders(cookie.value),
}))

import { getCurrentAdmin, getCurrentUser } from '@/shared/auth/current-user'
import { GET as listVideos } from '@/app/api/admin/characters/[id]/videos/route'

const tag = randomBytes(6).toString('hex')
const ADMIN = { email: `it-admin-${tag}@local.test`, password: randomBytes(18).toString('hex') }
const CUSTOMER = { email: `it-user-${tag}@local.test`, password: randomBytes(18).toString('hex') }

let payload: BasePayload
let adminId: number | undefined
let customerId: number | undefined
let adminToken = ''
let customerToken = ''
const savedBypass = process.env.DEV_AUTH_BYPASS

const asCookie = (token: string) => `payload-token=${token}`

beforeAll(async () => {
  // The bypass would make every getCurrentUser() the dev user.
  process.env.DEV_AUTH_BYPASS = ''
  payload = await getPayload({ config })

  const admin = await payload.create({ collection: 'admins', data: ADMIN as never, overrideAccess: true })
  adminId = Number(admin.id)
  const customer = await payload.create({
    collection: 'users',
    data: { ...CUSTOMER, _verified: true, emailVerified: true } as never,
    overrideAccess: true,
  })
  customerId = Number(customer.id)

  adminToken = (await payload.login({ collection: 'admins', data: ADMIN })).token ?? ''
  customerToken = (await payload.login({ collection: 'users', data: CUSTOMER })).token ?? ''
  expect(adminToken).toBeTruthy()
  expect(customerToken).toBeTruthy()
}, 120_000)

afterAll(async () => {
  process.env.DEV_AUTH_BYPASS = savedBypass
  if (!payload) return
  if (customerId) {
    await payload.delete({ collection: 'token-balances', where: { userId: { equals: customerId } }, overrideAccess: true })
    await payload.delete({ collection: 'users', id: customerId, overrideAccess: true })
  }
  if (adminId) await payload.delete({ collection: 'admins', id: adminId, overrideAccess: true })
})

describe('admin vs customer sessions (real DB)', () => {
  it('only an admin session may open /admin', async () => {
    const asAdmin = await payload.auth({ headers: browserHeaders(asCookie(adminToken)) })
    expect(asAdmin.user?.collection).toBe('admins')
    expect(asAdmin.permissions.canAccessAdmin).toBe(true)

    const asCustomer = await payload.auth({ headers: browserHeaders(asCookie(customerToken)) })
    expect(asCustomer.user?.collection).toBe('users')
    expect(asCustomer.permissions.canAccessAdmin).toBeFalsy()
  })

  it('getCurrentUser and getCurrentAdmin each accept only their own kind', async () => {
    cookie.value = asCookie(adminToken)
    expect(Number((await getCurrentAdmin())?.id)).toBe(adminId)
    expect(await getCurrentUser()).toBeNull()

    cookie.value = asCookie(customerToken)
    expect(Number((await getCurrentUser())?.id)).toBe(customerId)
    expect(await getCurrentAdmin()).toBeNull()
  })

  it('/api/admin/* rejects a customer and serves an admin', async () => {
    const call = () =>
      listVideos(new Request('http://localhost/api/admin/characters/1/videos'), {
        params: Promise.resolve({ id: '1' }),
      })

    cookie.value = asCookie(customerToken)
    expect((await call()).status).toBe(401)

    cookie.value = ''
    expect((await call()).status).toBe(401)

    cookie.value = asCookie(adminToken)
    expect((await call()).status).toBe(200)
  })
})
