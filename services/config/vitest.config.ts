import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: { '@wingman/db': resolve(import.meta.dirname, 'src/test/db-stub.ts') },
  },
  test: {
    environment: 'node',
    name: 'config',
  },
})
