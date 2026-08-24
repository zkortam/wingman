import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface ConfigStorage {
  get(key: string): string | undefined
  set(key: string, value: string): void
}

export class FileConfigStorage implements ConfigStorage {
  readonly #directory: string

  constructor(directory = join(tmpdir(), 'wingman-config')) {
    this.#directory = directory
  }

  get(key: string): string | undefined {
    try {
      return readFileSync(this.#path(key), 'utf8')
    } catch {
      return undefined
    }
  }

  set(key: string, value: string): void {
    try {
      mkdirSync(this.#directory, { recursive: true, mode: 0o700 })
      const destination = this.#path(key)
      const temporary = `${destination}.${String(process.pid)}.tmp`
      writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, destination)
    } catch {
      return
    }
  }

  #path(key: string): string {
    return join(this.#directory, `${createHash('sha256').update(key).digest('hex')}.json`)
  }
}
