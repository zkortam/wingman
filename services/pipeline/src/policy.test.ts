import { describe, expect, it } from 'vitest'

import { positiveDuration } from './policy.js'

describe('pipeline duration policy', () => {
  it('accepts positive finite durations and rejects unsafe environment values', () => {
    expect(positiveDuration('250', 1_000)).toBe(250)
    expect(positiveDuration('0', 1_000)).toBe(1_000)
    expect(positiveDuration('-1', 1_000)).toBe(1_000)
    expect(positiveDuration('NaN', 1_000)).toBe(1_000)
    expect(positiveDuration('Infinity', 1_000)).toBe(1_000)
  })
})
