import { describe, expect, it } from 'vitest'

import { requiredCassetteRequests } from './cassette-manifest'

describe('requiredCassetteRequests', () => {
  it('pins the explicit variance request used in the demo', () => {
    expect(requiredCassetteRequests).toHaveLength(1)
    expect(requiredCassetteRequests[0]?.messages[0]?.context.variance).toBe(true)
  })
})
