import type { AgentConfig } from '@wingman/schema'
import { describe, expect, it } from 'vitest'

import { InMemoryConfigRepository } from './repository'

const base = { systemPrompt: 'base', tools: [], rules: [] } as unknown as AgentConfig

describe('InMemoryConfigRepository', () => {
  it('keeps one live override and preserves immutable versions', async () => {
    const repository = new InMemoryConfigRepository({
      agents: [
        {
          id: 'agent',
          baseConfig: base,
          baseVersion: 1,
          activeVersionId: null,
          writablePaths: ['rules'],
          maxDiffBytes: 4_096,
          signingKey: 'key',
        },
      ],
    })
    const override = {
      agentId: 'agent',
      userHash: 'user',
      versionId: 'v2',
      scope: 'USER' as const,
      revokedAt: null,
    }
    await repository.setUserOverride(override)
    await repository.setUserOverride({ ...override, versionId: 'v3' })
    expect((await repository.liveOverride('agent', 'user'))?.versionId).toBe('v3')
    expect(repository.revokedOverrideCount()).toBe(1)
  })
})
