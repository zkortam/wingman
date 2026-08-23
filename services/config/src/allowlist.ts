export type ConfigMutationReason = 'PATH_NOT_WRITABLE' | 'DIFF_TOO_LARGE'

export class ConfigMutationError extends Error {
  constructor(readonly reason: ConfigMutationReason) {
    super(reason)
    this.name = 'ConfigMutationError'
  }
}

const diffPaths = (diff: unknown): string[] => {
  if (Array.isArray(diff)) return diff.flatMap(diffPaths)
  if (!diff || typeof diff !== 'object') return []
  const record = diff as Record<string, unknown>
  if (typeof record.path === 'string') return [record.path]
  if (Array.isArray(record.operations)) return record.operations.flatMap(diffPaths)
  return Object.keys(record)
}

const matches = (path: string, allowed: string): boolean => {
  const pathParts = path.replaceAll('[', '.').replaceAll(']', '').split('.').filter(Boolean)
  const allowedParts = allowed.replaceAll('[', '.').replaceAll(']', '').split('.').filter(Boolean)
  return pathParts.length === allowedParts.length && allowedParts.every((part, index) => part === '*' || part === pathParts[index])
}

export const assertWritable = (diff: unknown, writablePaths: string[], maxDiffBytes: number): void => {
  const bytes = new TextEncoder().encode(JSON.stringify(diff)).byteLength
  if (bytes > maxDiffBytes) throw new ConfigMutationError('DIFF_TOO_LARGE')
  const paths = diffPaths(diff)
  if (paths.length === 0 || paths.some((path) => !writablePaths.some((allowed) => matches(path, allowed)))) {
    throw new ConfigMutationError('PATH_NOT_WRITABLE')
  }
}
