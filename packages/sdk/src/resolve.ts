import { createHmac, timingSafeEqual } from 'node:crypto'
import { AgentConfigSchema, canonicalJSON, type AgentConfig } from '@wingman/schema'

import { CONFIG_CACHE_TTL_MS, CONFIG_TIMEOUT_MS, STORAGE_PREFIX } from './constants.js'
import { configChangeBytes, hasOnlyWritableChanges } from './permissions.js'
import { withTimeout } from './timeout.js'

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
  timeoutMs?: number
}

interface CacheEntry {
  config: AgentConfig
  expiresAt: number
}

const storageKey = (agent: string, userHash: string): string => `${STORAGE_PREFIX}:${agent}:${userHash}`

export class ConfigResolver {
  readonly #options: ResolverOptions
  readonly #cache = new Map<string, CacheEntry>()
  readonly #inflight = new Map<string, Promise<AgentConfig>>()

  constructor(options: ResolverOptions) {
    this.#options = options
  }

  clear(): void { this.#cache.clear() }

  async resolve(agent: string, userHash: string): Promise<AgentConfig> {
    const key = storageKey(agent, userHash)
    const now = this.#options.now?.() ?? Date.now()
    const cached = this.#cache.get(key)
    if (cached && cached.expiresAt > now) return structuredClone(cached.config)

    const active = this.#inflight.get(key)
    if (active) return structuredClone(await active)

    const pending = this.#resolveCold(key, agent, userHash, now)
    this.#inflight.set(key, pending)
    try {
      return structuredClone(await pending)
    } finally {
      if (this.#inflight.get(key) === pending) this.#inflight.delete(key)
    }
  }

  async #resolveCold(key: string, agent: string, userHash: string, now: number): Promise<AgentConfig> {
    const remote = await this.#remote(agent, userHash)
    const config = remote?.config ?? this.#lastKnownGood(key, agent) ?? this.#options.baseConfig
    this.#cache.set(key, { config: structuredClone(config), expiresAt: now + CONFIG_CACHE_TTL_MS })
    return config
  }

  async #remote(agent: string, userHash: string): Promise<StoredConfig | null> {
    try {
      const fetcher = this.#options.fetcher ?? fetch
      const timeoutMs = this.#options.timeoutMs ?? CONFIG_TIMEOUT_MS
      const response = await withTimeout(
        fetcher(`${this.#options.endpoint}/v1/config/${encodeURIComponent(agent)}/${encodeURIComponent(userHash)}`, {
          headers: { authorization: `Bearer ${this.#options.apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        }),
        timeoutMs,
        'Config resolution timed out',
      )
      if (!response.ok) return null
      const payload = this.#valid(agent, await response.json())
      if (payload === null) return null
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
      return this.#valid(agent, JSON.parse(serialized))?.config ?? null
    } catch {
      return null
    }
  }

  #valid(agent: string, input: unknown): StoredConfig | null {
    if (!input || typeof input !== 'object') return null
    const value = input as Record<string, unknown>
    if (!Number.isSafeInteger(value.version) || (value.version as number) < 0) return null
    if (typeof value.signature !== 'string' || !/^[a-f0-9]{64}$/.test(value.signature)) return null
    const parsedConfig = AgentConfigSchema.safeParse(value.config)
    if (!parsedConfig.success) return null
    const payload: StoredConfig = {
      config: parsedConfig.data,
      version: value.version as number,
      signature: value.signature,
    }
    const expected = createHmac('sha256', this.#options.signingKey).update(`${agent}.${payload.version}.${canonicalJSON(payload.config)}`).digest('hex')
    const actualBuffer = Buffer.from(payload.signature, 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null
    if (this.#options.writablePaths && !hasOnlyWritableChanges(this.#options.baseConfig, payload.config, this.#options.writablePaths)) return null
    if (this.#options.maxDiffBytes !== undefined && configChangeBytes(this.#options.baseConfig, payload.config) > this.#options.maxDiffBytes) return null
    if (!(this.#options.validate?.(payload.config) ?? true)) return null
    return payload
  }

  #readStorage(key: string): string | undefined {
    return this.#options.storage?.get?.(key) ?? this.#options.storage?.getItem?.(key) ?? undefined
  }

  #writeStorage(key: string, value: string): void {
    try {
      if (this.#options.storage?.set) this.#options.storage.set(key, value)
      else this.#options.storage?.setItem?.(key, value)
    } catch {
      return
    }
  }
}
