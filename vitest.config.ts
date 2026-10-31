import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Tests run unit-only against an in-memory mock payload — no DB required.
    // Integration tests against the real database live in tests/integration
    // and run separately: `pnpm test:integration` (vitest.integration.config.ts).
    exclude: ['node_modules', '.next', 'tests/integration/**'],
  },
})
