import { describe, expect, it } from 'vitest'

import { SupabaseConfigRepository } from './supabase-repository'

describe('SupabaseConfigRepository', () => {
  it('maps database column names into the config domain contract', async () => {
    const row = { agent_id: 'agent', user_hash: 'user', version_id: 'v2', scope: 'USER', revoked_at: null }
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      maybeSingle: async () => ({ data: row, error: null }),
    }
    const database = { from: () => query } as unknown as ConstructorParameters<typeof SupabaseConfigRepository>[0]
    const repository = new SupabaseConfigRepository(database)
    expect(await repository.liveOverride('agent', 'user')).toEqual({
      agentId: 'agent',
      userHash: 'user',
      versionId: 'v2',
      scope: 'USER',
      revokedAt: null,
    })
  })
})
