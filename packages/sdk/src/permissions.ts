import { isConfigPathWritable } from '@wingman/schema'

interface ConfigChange {
  path: string
  value: unknown
}

const changes = (base: unknown, candidate: unknown, path = ''): ConfigChange[] => {
  if (Object.is(base, candidate)) return []
  if (Array.isArray(base) && Array.isArray(candidate)) {
    return JSON.stringify(base) === JSON.stringify(candidate) ? [] : [{ path, value: candidate }]
  }
  if (base && candidate && typeof base === 'object' && typeof candidate === 'object') {
    const baseRecord = base as Record<string, unknown>
    const candidateRecord = candidate as Record<string, unknown>
    return [...new Set([...Object.keys(baseRecord), ...Object.keys(candidateRecord)])].flatMap((key) =>
      changes(baseRecord[key], candidateRecord[key], path ? `${path}.${key}` : key),
    )
  }
  return [{ path, value: candidate ?? null }]
}

export const hasOnlyWritableChanges = (base: unknown, candidate: unknown, writablePaths: string[]): boolean =>
  changes(base, candidate).every(({ path }) => writablePaths.some((allowed) => isConfigPathWritable(path, allowed)))

export const configChangeBytes = (base: unknown, candidate: unknown): number =>
  new TextEncoder().encode(JSON.stringify(changes(base, candidate))).byteLength
