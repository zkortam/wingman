import type { AgentConfig, ConfigVersion, Scope } from '@wingman/schema'

export interface StoredAgent {
  id: string
  baseConfig: AgentConfig
  baseVersion: number
  activeVersionId: string | null
  writablePaths: string[]
  maxDiffBytes: number
  /** Raw key bytes. bytea columns arrive hex-escaped and must be decoded first. */
  signingKey: string | Buffer
}

export type StoredVersion = ConfigVersion

export interface StoredOverride {
  agentId: string
  userHash: string
  versionId: string
  scope: Scope
  revokedAt: string | null
}

export interface ConfigRepository {
  agent(agentId: string): Promise<StoredAgent | null>
  version(versionId: string): Promise<StoredVersion | null>
  versions(agentId: string): Promise<StoredVersion[]>
  liveOverride(agentId: string, userHash: string): Promise<StoredOverride | null>
  insertVersion(version: StoredVersion): Promise<void>
  setUserOverride(override: StoredOverride): Promise<void>
  setGlobalVersion(agentId: string, versionId: string): Promise<void>
  clearGlobalVersion(agentId: string): Promise<void>
  revokeUserOverride(agentId: string, userHash: string): Promise<void>
}

interface MemorySeed {
  agents: StoredAgent[]
  versions?: StoredVersion[]
}

export class InMemoryConfigRepository implements ConfigRepository {
  readonly #agents = new Map<string, StoredAgent>()
  readonly #versions = new Map<string, StoredVersion>()
  readonly #overrides: StoredOverride[] = []
  #unavailable = false

  constructor(seed: MemorySeed) {
    for (const agent of seed.agents) this.#agents.set(agent.id, structuredClone(agent))
    for (const version of seed.versions ?? [])
      this.#versions.set(version.id, structuredClone(version))
  }

  setUnavailable(unavailable: boolean): void {
    this.#unavailable = unavailable
  }
  versionCount(): number {
    return this.#versions.size
  }
  revokedOverrideCount(): number {
    return this.#overrides.filter((override) => override.revokedAt).length
  }

  async agent(agentId: string): Promise<StoredAgent | null> {
    this.#assertAvailable()
    return structuredClone(this.#agents.get(agentId) ?? null)
  }

  async version(versionId: string): Promise<StoredVersion | null> {
    this.#assertAvailable()
    return structuredClone(this.#versions.get(versionId) ?? null)
  }

  async versions(agentId: string): Promise<StoredVersion[]> {
    this.#assertAvailable()
    return [...this.#versions.values()]
      .filter((version) => version.agentId === agentId)
      .map((version) => structuredClone(version))
  }

  async liveOverride(agentId: string, userHash: string): Promise<StoredOverride | null> {
    this.#assertAvailable()
    const match = this.#latestLiveOverride(agentId, userHash)
    return structuredClone(match ?? null)
  }

  async insertVersion(version: StoredVersion): Promise<void> {
    this.#assertAvailable()
    if (this.#versions.has(version.id)) return
    if (
      [...this.#versions.values()].some(
        (stored) => stored.agentId === version.agentId && stored.version === version.version,
      )
    ) {
      throw new Error(`Duplicate config version: ${version.agentId}:${String(version.version)}`)
    }
    this.#versions.set(version.id, structuredClone(version))
  }

  async setUserOverride(override: StoredOverride): Promise<void> {
    this.#assertAvailable()
    await this.revokeUserOverride(override.agentId, override.userHash)
    this.#overrides.push(structuredClone(override))
  }

  async setGlobalVersion(agentId: string, versionId: string): Promise<void> {
    this.#assertAvailable()
    const agent = this.#agents.get(agentId)
    if (!agent) throw new Error(`Unknown agent: ${agentId}`)
    agent.activeVersionId = versionId
  }

  async clearGlobalVersion(agentId: string): Promise<void> {
    this.#assertAvailable()
    const agent = this.#agents.get(agentId)
    if (!agent) throw new Error(`Unknown agent: ${agentId}`)
    agent.activeVersionId = null
  }

  async revokeUserOverride(agentId: string, userHash: string): Promise<void> {
    this.#assertAvailable()
    const active = this.#latestLiveOverride(agentId, userHash)
    if (active) active.revokedAt = new Date().toISOString()
  }

  #latestLiveOverride(agentId: string, userHash: string): StoredOverride | undefined {
    for (let index = this.#overrides.length - 1; index >= 0; index -= 1) {
      const override = this.#overrides[index]
      if (override?.agentId === agentId && override.userHash === userHash && !override.revokedAt)
        return override
    }
    return undefined
  }

  #assertAvailable(): void {
    if (this.#unavailable) throw new Error('Config repository unavailable')
  }
}
