import { randomUUID } from 'node:crypto'
import { ConfigVersionSchema, diffConfigs, type AgentConfig, type ConfigDiff, type ConfigStore, type ConfigVersion, type Scope } from '@wingman/schema'

import { assertWritable } from './allowlist'
import { ResolutionCache } from './cache'
import type { ConfigRepository } from './repository'
import { signVersion } from './signature'

interface StoreOptions {
  repository: ConfigRepository
  fallbackConfigs: ReadonlyMap<string, AgentConfig>
  canonicalize: (value: unknown) => string
  ttlMs?: number
}

export interface SignedConfigEnvelope {
  config: AgentConfig
  version: number
  signature: string
}

const cacheKey = (agentId: string, userHash: string): string => `${agentId}:${userHash}`

export class WingmanConfigStore implements ConfigStore {
  readonly #repository: ConfigRepository
  readonly #fallbackConfigs: ReadonlyMap<string, AgentConfig>
  readonly #canonicalize: (value: unknown) => string
  readonly #cache: ResolutionCache<AgentConfig>

  constructor(options: StoreOptions) {
    this.#repository = options.repository
    this.#fallbackConfigs = options.fallbackConfigs
    this.#canonicalize = options.canonicalize
    this.#cache = new ResolutionCache({ ttlMs: options.ttlMs ?? 5_000 })
  }

  async resolve(agentId: string, userHash: string): Promise<AgentConfig> {
    const config = await this.#cache.resolve(cacheKey(agentId, userHash), async () => {
      try {
        const agent = await this.#repository.agent(agentId)
        if (!agent) return this.#fallback(agentId)
        const override = await this.#repository.liveOverride(agentId, userHash)
        const versionId = override?.versionId ?? agent.activeVersionId
        if (!versionId) return agent.baseConfig
        return (await this.#repository.version(versionId))?.config ?? agent.baseConfig
      } catch {
        return this.#fallback(agentId)
      }
    })
    return structuredClone(config)
  }

  async base(agentId: string): Promise<AgentConfig> {
    try {
      return structuredClone((await this.#repository.agent(agentId))?.baseConfig ?? this.#fallback(agentId))
    } catch {
      return this.#fallback(agentId)
    }
  }

  async resolveSigned(agentId: string, userHash: string): Promise<SignedConfigEnvelope> {
    const agent = await this.#repository.agent(agentId)
    if (!agent) throw new Error(`Unknown agent: ${agentId}`)
    const override = await this.#repository.liveOverride(agentId, userHash)
    const versionId = override?.versionId ?? agent.activeVersionId
    if (versionId) {
      const stored = await this.#repository.version(versionId)
      if (stored) {
        return {
          config: structuredClone(stored.config),
          version: stored.version,
          signature: stored.signature,
        }
      }
    }
    const config = structuredClone(agent.baseConfig)
    return {
      config,
      version: agent.baseVersion,
      signature: signVersion({
        key: agent.signingKey,
        agentId,
        version: agent.baseVersion,
        config,
        canonicalize: this.#canonicalize,
      }),
    }
  }

  async writeVersion(agentId: string, config: AgentConfig, incidentId: string): Promise<ConfigVersion> {
    const agent = await this.#repository.agent(agentId)
    if (!agent) throw new Error(`Unknown agent: ${agentId}`)
    const diff = diffConfigs(agent.baseConfig, config)
    if (diff) assertWritable(diff, agent.writablePaths, agent.maxDiffBytes)
    const versions = await this.#repository.versions(agentId)
    const existing = versions.find((version) => version.incidentId === incidentId && this.#canonicalize(version.config) === this.#canonicalize(config))
    if (existing) return existing
    const next = versions.reduce((maximum, version) => Math.max(maximum, version.version), 0) + 1
    const version = ConfigVersionSchema.parse({
      id: randomUUID(),
      agentId,
      version: next,
      config: structuredClone(config),
      incidentId,
      signature: signVersion({ key: agent.signingKey, agentId, version: next, config, canonicalize: this.#canonicalize }),
      createdBy: 'PIPELINE',
      createdAt: new Date().toISOString(),
    })
    try {
      await this.#repository.insertVersion(version)
    } catch (error) {
      const raced = (await this.#repository.versions(agentId)).find((stored) =>
        stored.incidentId === incidentId && this.#canonicalize(stored.config) === this.#canonicalize(config),
      )
      if (raced) return raced
      throw error
    }
    this.#cache.invalidateAgent(agentId)
    return version
  }

  async setOverride(agentId: string, userHash: string, versionId: string, scope: Scope): Promise<void> {
    if (scope === 'GLOBAL') await this.#repository.setGlobalVersion(agentId, versionId)
    else await this.#repository.setUserOverride({ agentId, userHash, versionId, scope, revokedAt: null })
    this.#cache.invalidateAgent(agentId)
  }

  async revertOverride(agentId: string, userHash: string): Promise<void> {
    if (userHash === '') await this.#repository.clearGlobalVersion(agentId)
    else await this.#repository.revokeUserOverride(agentId, userHash)
    this.#cache.invalidateAgent(agentId)
  }

  async listVersions(agentId: string): Promise<ConfigVersion[]> {
    return this.#repository.versions(agentId)
  }

  async assertWritable(agentId: string, diff: ConfigDiff): Promise<void> {
    const agent = await this.#repository.agent(agentId)
    if (!agent) throw new Error(`Unknown agent: ${agentId}`)
    assertWritable(diff, agent.writablePaths, agent.maxDiffBytes)
  }

  #fallback(agentId: string): AgentConfig {
    const config = this.#fallbackConfigs.get(agentId) ?? this.#fallbackConfigs.get('*')
    if (config) return structuredClone(config)
    throw new Error(`Missing BASE_CONFIG for agent: ${agentId}`)
  }
}
