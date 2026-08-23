import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    name: 'fixtures',
    exclude: ['src/pipeline.test.ts'],
  },
})
