import type { Executor, Row } from '@wingman/db'
import { AgentConfigSchema, ConfigVersionSchema, ScopeSchema } from '@wingman/schema'

import { decodeByteaSecret } from './bytea'
import type { ConfigRepository, StoredAgent, StoredOverride, StoredVersion } from './repository'

type VersionRow = Row<'config_versions'>

export class PostgresConfigRepository implements ConfigRepository {
  constructor(private readonly sql: Executor) {}

  async agent(agentId: string): Promise<StoredAgent | null> {
    const rows = await this.sql<
      (Pick<
        Row<'agents'>,
        | 'id'
        | 'base_config'
        | 'base_version'
        | 'active_version_id'
        | 'writable_paths'
        | 'max_diff_bytes'
      > & { signing_key: Buffer })[]
    >`
      select a.id, a.base_config, a.base_version, a.active_version_id,
             a.writable_paths, a.max_diff_bytes, o.signing_key
      from agents a join orgs o on o.id = a.org_id
      where a.id = ${agentId}
    `
    const row = rows[0]
    if (row === undefined) return null
    const signingKey = decodeByteaSecret(row.signing_key)
    if (signingKey.length === 0) throw new Error(`Missing signing key: ${agentId}`)
    return {
      id: row.id,
      baseConfig: AgentConfigSchema.parse(row.base_config),
      baseVersion: row.base_version,
      activeVersionId: row.active_version_id,
      writablePaths: row.writable_paths,
      maxDiffBytes: row.max_diff_bytes,
      signingKey,
    }
  }

  async version(versionId: string): Promise<StoredVersion | null> {
    const rows = await this.sql<VersionRow[]>`
      select * from config_versions where id = ${versionId}
    `
    const row = rows[0]
    return row === undefined ? null : this.#mapVersion(row)
  }

  async versions(agentId: string): Promise<StoredVersion[]> {
    const rows = await this.sql<VersionRow[]>`
      select * from config_versions where agent_id = ${agentId} order by version desc
    `
    return rows.map((row) => this.#mapVersion(row))
  }

  async liveOverride(agentId: string, userHash: string): Promise<StoredOverride | null> {
    const rows = await this.sql<Row<'config_overrides'>[]>`
      select * from config_overrides
      where agent_id = ${agentId} and user_hash = ${userHash} and revoked_at is null
    `
    const row = rows[0]
    if (row === undefined) return null
    return {
      agentId: row.agent_id,
      userHash: row.user_hash,
      versionId: row.version_id,
      scope: ScopeSchema.parse(row.scope),
      revokedAt: row.revoked_at,
    }
  }

  async insertVersion(version: StoredVersion): Promise<void> {
    await this.sql`
      insert into config_versions (
        id, agent_id, version, config, incident_id, signature, created_by, created_at
      ) values (
        ${version.id}::uuid, ${version.agentId}::uuid, ${version.version},
        ${this.sql.json(version.config)}::jsonb, ${version.incidentId},
        ${version.signature}, ${version.createdBy}, ${version.createdAt}::timestamptz
      )
    `
  }

  async setUserOverride(override: StoredOverride): Promise<void> {
    // Revoke and insert in one transaction; separately, a failure between them left
    // the user with no override at all and silently back on the global config.
    await this.sql.begin(async (tx) => {
      await tx`
        update config_overrides set revoked_at = now()
        where agent_id = ${override.agentId} and user_hash = ${override.userHash}
          and revoked_at is null
      `
      await tx`
        insert into config_overrides (agent_id, user_hash, version_id, scope, revoked_at)
        values (
          ${override.agentId}::uuid, ${override.userHash}, ${override.versionId}::uuid,
          ${override.scope}, null
        )
      `
    })
  }

  async setGlobalVersion(agentId: string, versionId: string): Promise<void> {
    await this.sql`update agents set active_version_id = ${versionId}::uuid where id = ${agentId}`
  }

  async clearGlobalVersion(agentId: string): Promise<void> {
    await this.sql`update agents set active_version_id = null where id = ${agentId}`
  }

  async revokeUserOverride(agentId: string, userHash: string): Promise<void> {
    await this.sql`
      update config_overrides set revoked_at = now()
      where agent_id = ${agentId} and user_hash = ${userHash} and revoked_at is null
    `
  }

  #mapVersion(row: VersionRow): StoredVersion {
    return ConfigVersionSchema.parse({
      id: row.id,
      agentId: row.agent_id,
      version: row.version,
      config: row.config,
      incidentId: row.incident_id,
      signature: row.signature,
      createdBy: row.created_by,
      createdAt: row.created_at,
    })
  }
}
