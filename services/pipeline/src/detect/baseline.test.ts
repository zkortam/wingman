import { describe, expect, it } from 'vitest'

import { adjustForBaseline } from './baseline.js'

describe('adjustForBaseline', () => {
  it('suppresses a cue that is already common for this user', () => {
    expect(adjustForBaseline(1, 0)).toBe(1)
    expect(adjustForBaseline(1, 1)).toBe(0)
    expect(adjustForBaseline(0.8, 0.5)).toBeCloseTo(0.4)
    expect(adjustForBaseline(1.4, -1)).toBe(1)
  })
})
