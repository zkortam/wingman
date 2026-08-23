const matches = (path: string, allowed: string): boolean => {
  const pathParts = path.split('.')
  const allowedParts = allowed.split('.')
  return pathParts.length === allowedParts.length && allowedParts.every((part, index) => part === '*' || part === pathParts[index])
}

interface ConfigChange {
  path: string
  value: unknown
}

const changes = (base: unknown, candidate: unknown, path = ''): ConfigChange[] => {
  if (Object.is(base, candidate)) return []
  if (Array.isArray(base) && Array.isArray(candidate)) {
    if (path === 'tools') {
      const baseTools = new Map(base.flatMap((tool) => tool && typeof tool === 'object' && typeof (tool as { name?: unknown }).name === 'string' ? [[(tool as { name: string }).name, tool] as const] : []))
      const candidateTools = new Map(candidate.flatMap((tool) => tool && typeof tool === 'object' && typeof (tool as { name?: unknown }).name === 'string' ? [[(tool as { name: string }).name, tool] as const] : []))
      return [...new Set([...baseTools.keys(), ...candidateTools.keys()])].flatMap((name) => changes(baseTools.get(name), candidateTools.get(name), `tools.${name}`))
    }
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
  changes(base, candidate).every(({ path }) => writablePaths.some((allowed) => matches(path, allowed)))

export const configChangeBytes = (base: unknown, candidate: unknown): number =>
  new TextEncoder().encode(JSON.stringify(changes(base, candidate))).byteLength
