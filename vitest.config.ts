import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      'packages/*/vitest.config.ts',
      'services/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
      'demo/*/vitest.config.ts',
      'fixtures/vitest.config.ts',
      'fixtures/vitest.pipeline.config.ts',
    ],
  },
})
