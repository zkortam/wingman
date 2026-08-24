import { afterEach, describe, expect, it, vi } from 'vitest'

import { operatorIdentity } from './operator-identity'

describe('operatorIdentity', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('requires explicit production identity instead of demo constants', () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('WINGMAN_ORG_ID', '')
    vi.stubEnv('WINGMAN_AGENT_ID', '')
    vi.stubEnv('WINGMAN_OPERATOR_USER_HASH', '')
    expect(() => operatorIdentity()).toThrow('WINGMAN_AGENT_ID')

    vi.stubEnv('WINGMAN_AGENT_ID', 'agent-production')
    vi.stubEnv('WINGMAN_ORG_ID', 'org-production')
    vi.stubEnv('WINGMAN_OPERATOR_USER_HASH', 'hashed-production-user')
    expect(operatorIdentity()).toEqual({
      orgId: 'org-production',
      agentId: 'agent-production',
      userHash: 'hashed-production-user',
    })
  })
})
