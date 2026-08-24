import { createHmac, timingSafeEqual } from 'node:crypto'
import { canonicalJSON, type AgentConfig } from '@wingman/schema'

import { CONFIG_CACHE_TTL_MS, CONFIG_TIMEOUT_MS, STORAGE_PREFIX } from './constants'
import { configChangeBytes, hasOnlyWritableChanges } from './permissions'

interface StoredConfig {
  config: AgentConfig
  version: number
  signature: string
}

interface StorageLike {
  get?(key: string): string | undefined
  set?(key: string, value: string): unknown
  getItem?(key: string): string | null
  setItem?(key: string, value: string): unknown
}

interface ResolverOptions {
  endpoint: string
  apiKey: string
  baseConfig: AgentConfig
  signingKey: string
  writablePaths?: string[]
  maxDiffBytes?: number
  validate?: (config: AgentConfig) => boolean
  fetcher?: typeof fetch
  storage?: StorageLike
  now?: () => number
}

interface CacheEntry {
  config: AgentConfig
  expiresAt: number
}

const storageKey = (agent: string, userHash: string): string => `${STORAGE_PREFIX}:${agent}:${userHash}`

export class ConfigResolver {
  readonly #options: ResolverOptions
  readonly #cache = new Map<string, CacheEntry>()

  constructor(options: ResolverOptions) {
    this.#options = options
  }

  clear(): void { this.#cache.clear() }

  async resolve(agent: string, userHash: string): Promise<AgentConfig> {
    const key = storageKey(agent, userHash)
    const now = this.#options.now?.() ?? Date.now()
    const cached = this.#cache.get(key)
    if (cached && cached.expiresAt > now) return structuredClone(cached.config)

    const remote = await this.#remote(agent, userHash)
    const config = remote?.config ?? this.#lastKnownGood(key, agent) ?? this.#options.baseConfig
    this.#cache.set(key, { config: structuredClone(config), expiresAt: now + CONFIG_CACHE_TTL_MS })
    return structuredClone(config)
  }

  async #remote(agent: string, userHash: string): Promise<StoredConfig | null> {
    try {
      const fetcher = this.#options.fetcher ?? fetch
      const response = await fetcher(`${this.#options.endpoint}/v1/config/${encodeURIComponent(agent)}/${encodeURIComponent(userHash)}`, {
        headers: { authorization: `Bearer ${this.#options.apiKey}` },
        signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
      })
      if (!response.ok) return null
      const payload = await response.json() as StoredConfig
      if (!this.#valid(agent, payload)) return null
      this.#writeStorage(storageKey(agent, userHash), JSON.stringify(payload))
      return payload
    } catch {
      return null
    }
  }

  #lastKnownGood(key: string, agent: string): AgentConfig | null {
    try {
      const serialized = this.#readStorage(key)
      if (!serialized) return null
      const payload = JSON.parse(serialized) as StoredConfig
      return this.#valid(agent, payload) ? payload.config : null
    } catch {
      return null
    }
  }

  #valid(agent: string, payload: StoredConfig): boolean {
    if (!payload || typeof payload.version !== 'number' || typeof payload.signature !== 'string') return false
    const expected = createHmac('sha256', this.#options.signingKey).update(`${agent}.${payload.version}.${canonicalJSON(payload.config)}`).digest('hex')
    const actualBuffer = Buffer.from(payload.signature, 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false
    if (this.#options.writablePaths && !hasOnlyWritableChanges(this.#options.baseConfig, payload.config, this.#options.writablePaths)) return false
    if (this.#options.maxDiffBytes !== undefined && configChangeBytes(this.#options.baseConfig, payload.config) > this.#options.maxDiffBytes) return false
    return this.#options.validate?.(payload.config) ?? true
  }

  #readStorage(key: string): string | undefined {
    return this.#options.storage?.get?.(key) ?? this.#options.storage?.getItem?.(key) ?? undefined
  }

  #writeStorage(key: string, value: string): void {
    this.#options.storage?.set?.(key, value)
    this.#options.storage?.setItem?.(key, value)
  }
}
