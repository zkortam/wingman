import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => cleanup())

Object.assign(navigator, {
  clipboard: { writeText: vi.fn(async () => undefined) },
})
