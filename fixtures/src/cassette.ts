import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type CassetteMode = 'record' | 'replay'

interface CassetteFile {
  key: string
  responses: unknown[]
}

interface CassetteOptions {
  directory: string
  mode: CassetteMode
}

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, nested]) => [key, normalize(nested)]),
    )
  }
  return value
}

export const cassetteKey = (request: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(normalize(request)))
    .digest('hex')

export class CassetteStore {
  readonly #directory: string
  readonly #mode: CassetteMode

  constructor(options: CassetteOptions) {
    this.#directory = options.directory
    this.#mode = options.mode
  }

  async preflight(requests: unknown[]): Promise<void> {
    if (this.#mode === 'record') return
    await Promise.all(
      requests.map(async (request) => {
        const key = cassetteKey(request)
        await this.#read(key).catch(() => {
          throw new Error(`Missing cassette: ${key}`)
        })
      }),
    )
  }

  async response<T>(request: unknown, sample: number, record: () => Promise<T>): Promise<T> {
    const key = cassetteKey(request)
    if (this.#mode === 'replay') {
      const cassette = await this.#read(key)
      if (!(sample in cassette.responses))
        throw new Error(`Missing cassette sample ${sample}: ${key}`)
      return cassette.responses[sample] as T
    }

    const response = await record()
    const existing = await this.#read(key).catch((): CassetteFile => ({ key, responses: [] }))
    existing.responses[sample] = response
    await this.#write(existing)
    return response
  }

  async #read(key: string): Promise<CassetteFile> {
    return JSON.parse(await readFile(join(this.#directory, `${key}.json`), 'utf8')) as CassetteFile
  }

  async #write(cassette: CassetteFile): Promise<void> {
    await mkdir(this.#directory, { recursive: true })
    const destination = join(this.#directory, `${cassette.key}.json`)
    const temporary = `${destination}.tmp`
    await writeFile(temporary, `${JSON.stringify(cassette, null, 2)}\n`)
    await rename(temporary, destination)
  }
}
