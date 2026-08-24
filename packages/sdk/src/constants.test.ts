import { describe, expect, it } from 'vitest'

import { CONFIG_CACHE_TTL_MS, CONFIG_MAX_DIFF_BYTES, CONFIG_TIMEOUT_MS, OBSERVATION_QUEUE_CAPACITY } from './constants'

describe('SDK budgets', () => {
  it('pins the serving and backpressure contracts', () => {
    expect(CONFIG_CACHE_TTL_MS).toBe(5_000)
    expect(CONFIG_TIMEOUT_MS).toBe(200)
    expect(CONFIG_MAX_DIFF_BYTES).toBe(4_096)
    expect(OBSERVATION_QUEUE_CAPACITY).toBe(100)
  })
})
