import { describe, expect, it } from 'vitest'

import { redactObservation } from './redact'

describe('redactObservation', () => {
  it('drops fields outside the customer allowlist and removes raw identity', async () => {
    const result = await redactObservation(
      { sessionId: 's1', userId: 'raw-user', intent: 'Email jane@example.com', secret: 'never-send' },
      { userHash: 'hashed', fields: ['intent'], scrub: async (value) => value.replace('jane@example.com', '[EMAIL]') },
    )

    expect(result).toEqual({ sessionId: 's1', userHash: 'hashed', intent: 'Email [EMAIL]' })
    expect(JSON.stringify(result)).not.toContain('raw-user')
    expect(JSON.stringify(result)).not.toContain('never-send')
  })

  it('redacts nested allowlisted values without copying their siblings', async () => {
    const result = await redactObservation(
      { sessionId: 's1', toolArgs: { recordId: 'OPP-1001', accountName: 'private' } },
      { userHash: 'hashed', fields: ['toolArgs.recordId'], scrub: async (value) => value },
    )
    expect(result).toEqual({ sessionId: 's1', userHash: 'hashed', toolArgs: { recordId: 'OPP-1001' } })
  })
})
