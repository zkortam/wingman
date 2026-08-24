import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // Product code only.
      include: ['packages/*/src/**', 'services/*/src/**', 'apps/web/src/**'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.contract.ts',
        '**/dist/**',
        '**/types.gen.ts',
        '**/src/test/**',
        '**/store/testing/**',
      ],
      /** Set at the level the suite reaches today, so coverage can only go up. */
      thresholds: {
        statements: 80,
        branches: 76,
        functions: 79,
        lines: 84,
      },
    },
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
