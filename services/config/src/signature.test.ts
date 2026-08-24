import { describe, expect, it } from 'vitest'

import { signVersion, verifyVersion } from './signature'

const canonicalize = (value: unknown): string =>
  JSON.stringify(value, Object.keys(value as object).sort())

describe('config signatures', () => {
  it('binds the agent, version, and canonical config', () => {
    const signature = signVersion({
      key: 'secret',
      agentId: 'agent',
      version: 2,
      config: { rules: ['one'] },
      canonicalize,
    })
    expect(
      verifyVersion({
        key: 'secret',
        agentId: 'agent',
        version: 2,
        config: { rules: ['one'] },
        signature,
        canonicalize,
      }),
    ).toBe(true)
    expect(
      verifyVersion({
        key: 'secret',
        agentId: 'agent',
        version: 3,
        config: { rules: ['one'] },
        signature,
        canonicalize,
      }),
    ).toBe(false)
  })
})
