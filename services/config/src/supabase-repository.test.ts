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

  it('rejects malformed JSON configuration at the database boundary', async () => {
    const row = {
      id: '10000000-0000-4000-8000-000000000001',
      base_config: { rules: [] },
      base_version: 1,
      active_version_id: null,
      writable_paths: ['rules'],
      max_diff_bytes: 4_096,
      orgs: { signing_key: 'key' },
    }
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: row, error: null }),
    }
    const database = { from: () => query } as unknown as ConstructorParameters<typeof SupabaseConfigRepository>[0]
    const repository = new SupabaseConfigRepository(database)
    await expect(repository.agent(row.id)).rejects.toThrow()
  })
})
