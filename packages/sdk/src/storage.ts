import { createHash } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export interface ConfigStorage {
  get(key: string): string | undefined
  set(key: string, value: string): void
  /** Removes one entry. Optional so existing host implementations still satisfy the port. */
  delete?(key: string): void
}

export interface FileConfigStorageOptions {
  /** Entries kept before the least recently written are evicted. */
  maxEntries?: number
  /** Age after which a cached config is ignored and removed. */
  maxAgeMs?: number
}

const DEFAULT_MAX_ENTRIES = 512
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000

/** Resolves a directory this process owns. */
const defaultDirectory = (): string => {
  const state = process.env.XDG_STATE_HOME?.trim()
  if (state) return join(state, 'wingman', 'config')
  const home = homedir()
  if (home && home.length > 0) {
    return process.platform === 'win32'
      ? join(
          process.env.LOCALAPPDATA?.trim() || join(home, 'AppData', 'Local'),
          'wingman',
          'config',
        )
      : join(home, '.local', 'state', 'wingman', 'config')
  }
  return join(tmpdir(), `wingman-config-${String(process.getuid?.() ?? 'shared')}`)
}

export class FileConfigStorage implements ConfigStorage {
  readonly #directory: string
  readonly #maxEntries: number
  readonly #maxAgeMs: number
  #verified = false

  constructor(directory: string = defaultDirectory(), options: FileConfigStorageOptions = {}) {
    this.#directory = directory
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.#maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  }

  get(key: string): string | undefined {
    try {
      const path = this.#path(key)
      const stats = lstatSync(path)
      // A symlink here is somebody else's file; a stale entry is a superseded policy.
      if (!stats.isFile()) return undefined
      if (Date.now() - stats.mtimeMs > this.#maxAgeMs) {
        rmSync(path, { force: true })
        return undefined
      }
      return readFileSync(path, 'utf8')
    } catch {
      return undefined
    }
  }

  set(key: string, value: string): void {
    this.#prepare()
    const destination = this.#path(key)
    const temporary = `${destination}.${String(process.pid)}.tmp`
    try {
      writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, destination)
    } catch (error) {
      try {
        rmSync(temporary, { force: true })
      } catch {
        // Best effort; the write failure below is the reportable event.
      }
      throw error
    }
    this.#evict()
  }

  delete(key: string): void {
    try {
      rmSync(this.#path(key), { force: true })
    } catch {
      // A cache entry that cannot be removed is not worth failing a request for.
    }
  }

  #prepare(): void {
    if (this.#verified) return
    mkdirSync(this.#directory, { recursive: true, mode: 0o700 })
    const stats = lstatSync(this.#directory)
    if (!stats.isDirectory()) {
      throw new Error(`Wingman config cache path is not a directory: ${this.#directory}`)
    }
    const uid = process.getuid?.()
    if (uid !== undefined && stats.uid !== uid) {
      throw new Error(
        `Wingman config cache directory ${this.#directory} is owned by another user; refusing to use it.`,
      )
    }
    this.#verified = true
  }

  /** Keeps the cache bounded: one file per (agent, user) grows without limit otherwise. */
  #evict(): void {
    try {
      const entries = readdirSync(this.#directory)
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          const path = join(this.#directory, name)
          return { path, mtimeMs: statSync(path).mtimeMs }
        })
      if (entries.length <= this.#maxEntries) return
      entries
        .sort((left, right) => left.mtimeMs - right.mtimeMs)
        .slice(0, entries.length - this.#maxEntries)
        .forEach(({ path }) => {
          rmSync(path, { force: true })
        })
    } catch {
      // Eviction is maintenance; a failure must not break config resolution.
    }
  }

  #path(key: string): string {
    return join(this.#directory, `${createHash('sha256').update(key).digest('hex')}.json`)
  }
}
