import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    name: 'fixtures',
    // Naming `exclude` replaces Vitest's defaults rather than adding to them, so the
    // node_modules entry has to be restated or dependencies' own test suites get
    // collected as if they were ours.
    exclude: ['**/node_modules/**', 'src/pipeline.test.ts'],
  },
})
