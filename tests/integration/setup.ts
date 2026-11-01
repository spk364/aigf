import { existsSync } from 'node:fs'
import { vi } from 'vitest'

// Same env as `next dev`. Without DATABASE_URL the Payload boot fails loudly.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

// Route and feature modules import 'server-only', which throws outside Next.
vi.mock('server-only', () => ({}))
