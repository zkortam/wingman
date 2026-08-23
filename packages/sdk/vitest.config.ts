import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      '@wingman/schema': resolve(import.meta.dirname, 'src/test/schema-stub.ts'),
      openredaction: resolve(import.meta.dirname, 'src/test/openredaction-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    name: 'sdk',
  },
})
