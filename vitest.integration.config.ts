// Integration tests: boot the real Payload config against the database in
// .env.local and exercise code paths unit tests can only mock (raw SQL through
// the actual adapter, routes end to end).
//
// That database is the shared one, so every test must work on rows it creates
// itself and delete them afterwards — see tests/integration/*.test.ts.
//
//   pnpm test:integration
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@payload-config': path.resolve(__dirname, './src/payload/payload.config.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // One Payload instance and one DB at a time — files would race on shared rows.
    fileParallelism: false,
  },
})
