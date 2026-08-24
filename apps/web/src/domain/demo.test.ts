import { describe, expect, it } from 'vitest'

import { DEMO_AGENT, DEMO_CONTROL_HASH, DEMO_REPORTER_HASH } from './demo'

describe('demo identities', () => {
  it('uses the same pseudonymous user shape as the production SDK', () => {
    expect(DEMO_REPORTER_HASH).toMatch(/^[a-f0-9]{32}$/)
    expect(DEMO_CONTROL_HASH).toMatch(/^[a-f0-9]{32}$/)
    expect(DEMO_REPORTER_HASH).not.toBe(DEMO_CONTROL_HASH)
    expect(DEMO_AGENT).toMatch(/^[a-f0-9-]{36}$/)
  })
})
