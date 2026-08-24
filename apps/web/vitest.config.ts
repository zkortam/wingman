import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  // The app's tsconfig leaves JSX to Next (`preserve`), so the test transform has to
  // handle it here. Vite 8 moved this off the deprecated `esbuild` option to `oxc`.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'jsdom',
    name: 'web',
    setupFiles: ['./src/test/setup.ts'],
  },
})
