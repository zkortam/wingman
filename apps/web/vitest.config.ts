import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    name: 'web',
    setupFiles: ['./src/test/setup.ts'],
  },
})
