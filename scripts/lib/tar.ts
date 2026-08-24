import { gunzipSync } from 'node:zlib'

/** A minimal, dependency-free reader for the tarballs `pnpm pack` produces. */
export interface TarEntry {
  name: string
  /** ustar type flag: '0' file, '5' directory, 'L' GNU long name, 'x' pax header. */
  type: string
  content: Buffer
}

const BLOCK = 512

const readString = (header: Buffer, start: number, length: number): string => {
  const raw = header.subarray(start, start + length)
  const end = raw.indexOf(0)
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8')
}

const readOctal = (header: Buffer, start: number, length: number): number => {
  const text = readString(header, start, length).trim()
  if (text.length === 0) return 0
  const value = Number.parseInt(text, 8)
  return Number.isFinite(value) ? value : 0
}

/** Extended-header records are `"<length> key=value\n"`; only `path` matters here. */
const paxPath = (content: Buffer): string | null => {
  const text = content.toString('utf8')
  let offset = 0
  while (offset < text.length) {
    const space = text.indexOf(' ', offset)
    if (space === -1) break
    const length = Number.parseInt(text.slice(offset, space), 10)
    if (!Number.isFinite(length) || length <= 0) break
    const record = text.slice(space + 1, offset + length).replace(/\n$/, '')
    const separator = record.indexOf('=')
    if (separator !== -1 && record.slice(0, separator) === 'path')
      return record.slice(separator + 1)
    offset += length
  }
  return null
}

export const readTarGz = (archive: Buffer): TarEntry[] => {
  const buffer = gunzipSync(archive)
  const entries: TarEntry[] = []
  let offset = 0
  let longName: string | null = null
  let extendedName: string | null = null

  while (offset + BLOCK <= buffer.length) {
    const header = buffer.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) break

    const rawName = readString(header, 0, 100)
    const size = readOctal(header, 124, 12)
    const type = readString(header, 156, 1) || '0'
    const prefix = readString(header, 345, 155)
    const content = buffer.subarray(offset + BLOCK, offset + BLOCK + size)
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK

    if (type === 'L') {
      longName = content.toString('utf8').replace(/\0+$/, '')
      continue
    }
    if (type === 'x' || type === 'X') {
      extendedName = paxPath(content)
      continue
    }
    if (type === 'g') continue

    const name = extendedName ?? longName ?? (prefix.length > 0 ? `${prefix}/${rawName}` : rawName)
    longName = null
    extendedName = null
    entries.push({ name, type, content: Buffer.from(content) })
  }

  return entries
}

/** Names of the regular files in an archive, in archive order. */
export const listTarGz = (archive: Buffer): string[] =>
  readTarGz(archive)
    .filter((entry) => entry.type === '0')
    .map((entry) => entry.name)

/** Reads one file out of an archive, or null when it is absent. */
export const readFromTarGz = (archive: Buffer, path: string): Buffer | null =>
  readTarGz(archive).find((entry) => entry.name === path && entry.type === '0')?.content ?? null
