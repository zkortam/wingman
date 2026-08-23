interface CacheOptions {
  ttlMs: number
  now?: () => number
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class ResolutionCache<T> {
  readonly #ttlMs: number
  readonly #now: () => number
  readonly #entries = new Map<string, CacheEntry<T>>()
  readonly #pending = new Map<string, Promise<T>>()

  constructor(options: CacheOptions) {
    this.#ttlMs = options.ttlMs
    this.#now = options.now ?? Date.now
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

    const resolution = resolver().then((value) => {
      this.#entries.set(key, { value, expiresAt: this.#now() + this.#ttlMs })
      this.#pending.delete(key)
      return value
    }, (error: unknown) => {
      this.#pending.delete(key)
      throw error
    })
    this.#pending.set(key, resolution)
    return resolution
  }

  invalidateAgent(agentId: string): void {
    const prefix = `${agentId}:`
    for (const key of this.#entries.keys()) if (key.startsWith(prefix)) this.#entries.delete(key)
  }
}
