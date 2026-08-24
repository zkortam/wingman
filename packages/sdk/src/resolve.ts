import { createHmac, timingSafeEqual } from 'node:crypto'
import { AgentConfigSchema, canonicalJSON, type AgentConfig } from '@wingman/schema'

import {
  CONFIG_CACHE_MAX_ENTRIES,
  CONFIG_CACHE_TTL_MS,
  CONFIG_FAILURE_CACHE_TTL_MS,
  CONFIG_TIMEOUT_MS,
  STORAGE_PREFIX,
} from './constants.js'
import { classifyStatus, report, type DiagnosticListener } from './diagnostics.js'
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
  cacheTtlMs?: number
  maxCacheEntries?: number
  onDiagnostic?: DiagnosticListener
}

interface CacheEntry {
  config: AgentConfig
  expiresAt: number
}

/** Where a resolved configuration came from, so a host can alarm on staleness. */
export type ConfigSource = 'remote' | 'last-known-good' | 'base'

const storageKey = (agent: string, userHash: string): string =>
  `${STORAGE_PREFIX}:${agent}:${userHash}`

export class ConfigResolver {
  readonly #options: ResolverOptions
  readonly #writablePaths: readonly string[] | undefined
  /** Insertion-ordered, so the oldest key is the first key: a Map is the LRU. */
  readonly #cache = new Map<string, CacheEntry>()
  readonly #inflight = new Map<string, Promise<AgentConfig>>()
  /** Highest version accepted per key. */
  readonly #highestVersion = new Map<string, number>()
  readonly #lastSource = new Map<string, ConfigSource>()

  constructor(options: ResolverOptions) {
    this.#options = options
    // Copied because the caller keeps a reference to the array it passed, and a later push would.
    this.#writablePaths = options.writablePaths
      ? Object.freeze([...options.writablePaths])
      : undefined
  }

  clear(): void {
    this.#cache.clear()
    this.#lastSource.clear()
  }

  /** Drops one cached entry so an urgent rollout is picked up without a restart. */
  invalidate(agent: string, userHash: string): void {
    const key = storageKey(agent, userHash)
    this.#cache.delete(key)
    this.#lastSource.delete(key)
  }

  /** Where the most recent resolution for this identity came from. */
  sourceOf(agent: string, userHash: string): ConfigSource | undefined {
    return this.#lastSource.get(storageKey(agent, userHash))
  }

  async resolve(agent: string, userHash: string): Promise<AgentConfig> {
    const key = storageKey(agent, userHash)
    const now = this.#options.now?.() ?? Date.now()
    const cached = this.#cache.get(key)
    if (cached && cached.expiresAt > now) {
      // Refresh recency so the LRU evicts genuinely cold identities.
      this.#cache.delete(key)
      this.#cache.set(key, cached)
      return structuredClone(cached.config)
    }
    if (cached) this.#cache.delete(key)

    const active = this.#inflight.get(key)
    if (active) return structuredClone(await active)

    const pending = this.#resolveCold(key, agent, userHash)
    this.#inflight.set(key, pending)
    try {
      return structuredClone(await pending)
    } finally {
      if (this.#inflight.get(key) === pending) this.#inflight.delete(key)
    }
  }

  async #resolveCold(key: string, agent: string, userHash: string): Promise<AgentConfig> {
    const remote = await this.#remote(agent, userHash)
    const lastKnownGood = remote === null ? this.#lastKnownGood(key, agent) : null
    const config = remote?.config ?? lastKnownGood ?? this.#options.baseConfig
    const source: ConfigSource =
      remote !== null ? 'remote' : lastKnownGood !== null ? 'last-known-good' : 'base'

    if (source !== 'remote') {
      report(this.#options.onDiagnostic, {
        stage: 'config',
        code: 'CONFIG_FALLBACK',
        message: `Configuration for ${agent} was served from ${source} because the control plane did not answer with an acceptable config.`,
        detail: { agent, source },
      })
    }

    // A failed resolution is cached only briefly.
    const ttl =
      source === 'remote'
        ? (this.#options.cacheTtlMs ?? CONFIG_CACHE_TTL_MS)
        : CONFIG_FAILURE_CACHE_TTL_MS
    const now = this.#options.now?.() ?? Date.now()
    this.#cache.set(key, { config: structuredClone(config), expiresAt: now + ttl })
    this.#lastSource.set(key, source)
    this.#evict()
    return config
  }

  #evict(): void {
    const limit = this.#options.maxCacheEntries ?? CONFIG_CACHE_MAX_ENTRIES
    while (this.#cache.size > limit) {
      const oldest = this.#cache.keys().next()
      if (oldest.done === true) break
      this.#cache.delete(oldest.value)
      this.#lastSource.delete(oldest.value)
    }
  }

  async #remote(agent: string, userHash: string): Promise<StoredConfig | null> {
    const timeoutMs = this.#options.timeoutMs ?? CONFIG_TIMEOUT_MS
    try {
      const fetcher = this.#options.fetcher ?? fetch
      const url = new URL(
        `v1/config/${encodeURIComponent(agent)}/${encodeURIComponent(userHash)}`,
        `${this.#options.endpoint}/`,
      )
      const response = await withTimeout(
        fetcher(url.toString(), {
          headers: { authorization: `Bearer ${this.#options.apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        }),
        timeoutMs,
        'Config resolution timed out',
      )
      if (!response.ok) {
        report(this.#options.onDiagnostic, {
          stage: 'config',
          code: classifyStatus(response.status),
          message: `Config resolution for ${agent} returned ${String(response.status)}.`,
          detail: { agent, status: response.status },
        })
        return null
      }
      const payload = this.#valid(
        agent,
        storageKey(agent, userHash),
        await response.json(),
        'remote',
      )
      if (payload === null) return null
      this.#writeStorage(storageKey(agent, userHash), JSON.stringify(payload))
      return payload
    } catch (cause) {
      report(this.#options.onDiagnostic, {
        stage: 'config',
        code:
          cause instanceof Error && /timed out/i.test(cause.message) ? 'TIMEOUT' : 'UNAVAILABLE',
        message: `Config resolution for ${agent} failed.`,
        cause,
        detail: { agent, timeoutMs },
      })
      return null
    }
  }

  #lastKnownGood(key: string, agent: string): AgentConfig | null {
    try {
      const serialized = this.#readStorage(key)
      if (!serialized) return null
      return this.#valid(agent, key, JSON.parse(serialized), 'stored')?.config ?? null
    } catch (cause) {
      report(this.#options.onDiagnostic, {
        stage: 'storage',
        code: 'STORAGE_UNAVAILABLE',
        message: 'Stored last-known-good configuration could not be read.',
        cause,
        detail: { agent },
      })
      return null
    }
  }

  #valid(
    agent: string,
    key: string,
    input: unknown,
    source: 'remote' | 'stored',
  ): StoredConfig | null {
    const reject = (reason: string, detail: Record<string, unknown> = {}): null => {
      report(this.#options.onDiagnostic, {
        stage: 'config',
        code: 'CONFIG_REJECTED',
        message: `Signed configuration for ${agent} was rejected: ${reason}.`,
        detail: { agent, reason, ...detail },
      })
      return null
    }
    if (!input || typeof input !== 'object') return reject('the payload was not an object')
    const value = input as Record<string, unknown>
    if (!Number.isSafeInteger(value.version) || (value.version as number) < 0) {
      return reject('the version was not a non-negative integer')
    }
    if (typeof value.signature !== 'string' || !/^[a-f0-9]{64}$/.test(value.signature)) {
      return reject('the signature was malformed')
    }
    const parsedConfig = AgentConfigSchema.safeParse(value.config)
    if (!parsedConfig.success) return reject('the config failed schema validation')
    const payload: StoredConfig = {
      config: parsedConfig.data,
      version: value.version as number,
      signature: value.signature,
    }
    const expected = createHmac('sha256', this.#options.signingKey)
      .update(`${agent}.${payload.version}.${canonicalJSON(payload.config)}`)
      .digest('hex')
    const actualBuffer = Buffer.from(payload.signature, 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return reject('the signature did not verify')
    }
    // The freshness rule applies to the local cache, not to the control plane.
    const highest = this.#highestVersion.get(key)
    if (source === 'stored' && highest !== undefined && payload.version < highest) {
      return reject('the stored version was older than one already served', {
        version: payload.version,
        highestServed: highest,
      })
    }
    if (
      this.#writablePaths &&
      !hasOnlyWritableChanges(this.#options.baseConfig, payload.config, [...this.#writablePaths])
    ) {
      return reject('it changed a path outside the writable allowlist')
    }
    if (this.#options.maxDiffBytes !== undefined) {
      const bytes = configChangeBytes(this.#options.baseConfig, payload.config)
      if (bytes > this.#options.maxDiffBytes) {
        return reject('the change exceeded maxDiffBytes', {
          bytes,
          maxDiffBytes: this.#options.maxDiffBytes,
        })
      }
    }
    if (!(this.#options.validate?.(payload.config) ?? true)) {
      return reject('the host validate() callback rejected it')
    }
    if (source === 'remote') this.#highestVersion.set(key, Math.max(highest ?? 0, payload.version))
    return payload
  }

  #readStorage(key: string): string | undefined {
    return this.#options.storage?.get?.(key) ?? this.#options.storage?.getItem?.(key) ?? undefined
  }

  #writeStorage(key: string, value: string): void {
    try {
      if (this.#options.storage?.set) this.#options.storage.set(key, value)
      else this.#options.storage?.setItem?.(key, value)
    } catch (cause) {
      report(this.#options.onDiagnostic, {
        stage: 'storage',
        code: 'STORAGE_UNAVAILABLE',
        message: 'Last-known-good configuration could not be written.',
        cause,
      })
    }
  }
}
