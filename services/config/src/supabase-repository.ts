import { createServiceClient } from '@outcome/db'
import type { AgentConfig } from '@outcome/schema'

import type { ConfigRepository, StoredAgent, StoredOverride, StoredVersion } from './repository'

const result = <T>(value: { data: T; error: { message: string } | null }): T => {
  if (value.error) throw new Error(value.error.message)
  return value.data
}

export class SupabaseConfigRepository implements ConfigRepository {
  readonly #db: ReturnType<typeof createServiceClient>

  constructor(db: ReturnType<typeof createServiceClient> = createServiceClient()) {
    this.#db = db
  }

  async agent(agentId: string): Promise<StoredAgent | null> {
    const data = result(await this.#db.from('agents').select('id,base_config,active_version_id,writable_paths,max_diff_bytes,orgs(signing_key)').eq('id', agentId).maybeSingle())
    if (!data) return null
    const org = Array.isArray(data.orgs) ? data.orgs[0] : data.orgs
    if (typeof org?.signing_key !== 'string' || org.signing_key.length === 0) throw new Error(`Missing signing key: ${agentId}`)
    return {
      id: data.id,
      baseConfig: data.base_config as AgentConfig,
      activeVersionId: data.active_version_id,
      writablePaths: data.writable_paths,
      maxDiffBytes: data.max_diff_bytes,
      signingKey: org.signing_key,
    }
  }

  async version(versionId: string): Promise<StoredVersion | null> {
    const data = result(await this.#db.from('config_versions').select('id,agent_id,version,config,incident_id,signature,created_at').eq('id', versionId).maybeSingle())
    return data ? this.#mapVersion(data) : null
  }

  async versions(agentId: string): Promise<StoredVersion[]> {
    const data = result(await this.#db.from('config_versions').select('id,agent_id,version,config,incident_id,signature,created_at').eq('agent_id', agentId).order('version', { ascending: false }))
    return data.map((row) => this.#mapVersion(row))
  }

  async liveOverride(agentId: string, userHash: string): Promise<StoredOverride | null> {
    const data = result(await this.#db.from('config_overrides').select('agent_id,user_hash,version_id,scope,revoked_at').eq('agent_id', agentId).eq('user_hash', userHash).is('revoked_at', null).maybeSingle())
    if (!data) return null
    return {
      agentId: data.agent_id,
      userHash: data.user_hash,
      versionId: data.version_id,
      scope: data.scope,
      revokedAt: data.revoked_at,
    } as StoredOverride
  }

  async insertVersion(version: StoredVersion): Promise<void> {
    result(await this.#db.from('config_versions').insert({
      id: version.id,
      agent_id: version.agentId,
      version: version.version,
      config: version.config,
      incident_id: version.incidentId,
      signature: version.signature,
      created_by: 'PIPELINE',
      created_at: version.createdAt,
    }))
  }

  async setUserOverride(override: StoredOverride): Promise<void> {
    await this.revokeUserOverride(override.agentId, override.userHash)
    result(await this.#db.from('config_overrides').insert({
      agent_id: override.agentId,
      user_hash: override.userHash,
      version_id: override.versionId,
      scope: override.scope,
      revoked_at: null,
    }))
  }

  async setGlobalVersion(agentId: string, versionId: string): Promise<void> {
    result(await this.#db.from('agents').update({ active_version_id: versionId }).eq('id', agentId))
  }

  async revokeUserOverride(agentId: string, userHash: string): Promise<void> {
    result(await this.#db.from('config_overrides').update({ revoked_at: new Date().toISOString() }).eq('agent_id', agentId).eq('user_hash', userHash).is('revoked_at', null))
  }

  #mapVersion(row: {
    id: string
    agent_id: string
    version: number
    config: unknown
    incident_id: string | null
    signature: string
    created_at: string
  }): StoredVersion {
    return {
      id: row.id,
      agentId: row.agent_id,
      version: row.version,
      config: row.config as AgentConfig,
      incidentId: row.incident_id,
      signature: row.signature,
      createdAt: row.created_at,
    }
  }
}
