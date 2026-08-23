import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'services/*/vitest.config.ts',
  'apps/*/vitest.config.ts',
  'fixtures/vitest.config.ts',
])
