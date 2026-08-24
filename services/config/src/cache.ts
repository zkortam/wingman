interface CacheOptions {
  ttlMs: number
  now?: () => number
  /** Entries retained before the least recently written is evicted. */
  maxEntries?: number
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const DEFAULT_MAX_ENTRIES = 10_000

export class ResolutionCache<T> {
  readonly #ttlMs: number
  readonly #now: () => number
  readonly #maxEntries: number
  readonly #entries = new Map<string, CacheEntry<T>>()
  readonly #pending = new Map<string, Promise<T>>()
  /** Bumped on every invalidation. */
  #generation = 0

  constructor(options: CacheOptions) {
    this.#ttlMs = options.ttlMs
    this.#now = options.now ?? Date.now
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  }

  has(key: string): boolean {
    const entry = this.#entries.get(key)
    return Boolean(entry && entry.expiresAt > this.#now())
  }

  async resolve(key: string, resolver: () => Promise<T>): Promise<T> {
    const entry = this.#entries.get(key)
    if (entry && entry.expiresAt > this.#now()) return entry.value
    const pending = this.#pending.get(key)
    if (pending) return pending

    const startedAt = this.#generation
    const resolution = resolver().then(
      (value) => {
        if (this.#pending.get(key) === resolution) this.#pending.delete(key)
        if (startedAt === this.#generation) {
          this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs })
          this.#evict()
        }
        return value
      },
      (error: unknown) => {
        if (this.#pending.get(key) === resolution) this.#pending.delete(key)
        throw error
      },
    )
    this.#pending.set(key, resolution)
    return resolution
  }

  invalidateAgent(agentId: string): void {
    const prefix = `${agentId}:`
    for (const key of this.#entries.keys()) if (key.startsWith(prefix)) this.#entries.delete(key)
    // Drop in-flight resolutions too, so the next caller re-reads rather than joining a request that.
    for (const key of this.#pending.keys()) if (key.startsWith(prefix)) this.#pending.delete(key)
    this.#generation += 1
  }

  /** Bounded: one entry per (agent, user) grows without limit otherwise. */
  #evict(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next()
      if (oldest.done === true) break
      this.#entries.delete(oldest.value)
    }
  }
}
