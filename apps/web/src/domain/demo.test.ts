import { describe, expect, it } from 'vitest'

import { DEMO_AGENT, DEMO_CONTROL_HASH, DEMO_REPORTER_HASH } from './demo'

describe('demo identity constants', () => {
  it('keeps reporter and control identities explicit and distinct', () => {
    expect(DEMO_AGENT).toBe('ops-copilot')
    expect(DEMO_REPORTER_HASH).not.toBe(DEMO_CONTROL_HASH)
  })
})
