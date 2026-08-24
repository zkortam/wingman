import { randomUUID } from 'node:crypto'

import {
  AgentConfigSchema,
  signConfig,
  type AgentConfig,
  type ConfigDiff,
  type ConfigStore,
  type ConfigVersion,
  type Scope,
} from '@wingman/schema'

import { enforceDiffBounds } from '../fix/bounds.js'
import { ReplayDatabase } from './database.js'

export class StubConfigStore implements ConfigStore {
  private readonly bases = new Map<string, AgentConfig>()
  private readonly versions = new Map<string, ConfigVersion[]>()
  private readonly overrides = new Map<string, string>()
  private readonly globalVersions = new Map<string, string>()

  constructor(
    private readonly database: ReplayDatabase,
    private readonly signingKey = 'replay-signing-key',
  ) {}

  seed(
    agentId: string,
    config: AgentConfig,
    writablePaths = ['systemPrompt', 'rules', 'tools', 'retrieval'],
  ): string {
    const parsed = AgentConfigSchema.parse(config)
    const id = randomUUID()
    this.bases.set(agentId, structuredClone(parsed))
    this.versions.set(agentId, [
      versionRecord(id, agentId, 1, parsed, null, 'BASE', this.signingKey),
    ])
    this.database.baseVersionIds.set(agentId, id)
    this.database.writablePolicies.set(agentId, {
      codexEndpoint: null,
      maxDiffBytes: 4096,
      writablePaths,
    })
    return id
  }

  async resolve(agentId: string, userHash: string): Promise<AgentConfig> {
    const versionId =
      this.overrides.get(`${agentId}:${userHash}`) ?? this.globalVersions.get(agentId)
    if (versionId === undefined) return this.base(agentId)
    const version = (this.versions.get(agentId) ?? []).find(({ id }) => id === versionId)
    if (version === undefined) throw new Error('Override version not found')
    return structuredClone(version.config)
  }

  async base(agentId: string): Promise<AgentConfig> {
    const config = this.bases.get(agentId)
    if (config === undefined) throw new Error(`Agent config not seeded: ${agentId}`)
    return structuredClone(config)
  }

  async writeVersion(
    agentId: string,
    config: AgentConfig,
    incidentId: string,
  ): Promise<ConfigVersion> {
    const versions = this.versions.get(agentId) ?? []
    const record = versionRecord(
      randomUUID(),
      agentId,
      versions.length + 1,
      AgentConfigSchema.parse(config),
      incidentId,
      'PIPELINE',
      this.signingKey,
    )
    versions.push(record)
    this.versions.set(agentId, versions)
    return structuredClone(record)
  }

  setOverride(agentId: string, userHash: string, versionId: string, scope: Scope): Promise<void> {
    if (scope === 'GLOBAL') this.globalVersions.set(agentId, versionId)
    else this.overrides.set(`${agentId}:${userHash}`, versionId)
    return Promise.resolve()
  }

  revertOverride(agentId: string, userHash: string): Promise<void> {
    if (userHash === '') this.globalVersions.delete(agentId)
    else this.overrides.delete(`${agentId}:${userHash}`)
    return Promise.resolve()
  }

  listVersions(agentId: string): Promise<ConfigVersion[]> {
    return Promise.resolve(structuredClone(this.versions.get(agentId) ?? []))
  }

  async assertWritable(agentId: string, diff: ConfigDiff): Promise<void> {
    const policy = this.database.writablePolicies.get(agentId)
    if (policy === undefined) throw new Error('Writable policy not found')
    enforceDiffBounds({
      diff,
      maxDiffBytes: policy.maxDiffBytes,
      writablePaths: policy.writablePaths,
    })
  }
}

function versionRecord(
  id: string,
  agentId: string,
  version: number,
  config: AgentConfig,
  incidentId: string | null,
  createdBy: ConfigVersion['createdBy'],
  signingKey: string,
): ConfigVersion {
  return {
    id,
    agentId,
    version,
    config: structuredClone(config),
    incidentId,
    signature: signConfig(signingKey, agentId, version, config),
    createdBy,
    createdAt: new Date().toISOString(),
  }
}
