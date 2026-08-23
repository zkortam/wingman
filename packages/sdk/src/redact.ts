interface RedactionOptions {
  userHash: string
  fields: string[]
  scrub: (value: string) => Promise<string>
}

const getPath = (value: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)

const setPath = (target: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split('.')
  let current = target
  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1) current[part] = value
    else {
      const nested: Record<string, unknown> = {}
      current[part] = nested
      current = nested
    }
  }
}

const scrubValue = async (value: unknown, scrub: (text: string) => Promise<string>): Promise<unknown> => {
  if (typeof value === 'string') return scrub(value)
  if (Array.isArray(value)) return Promise.all(value.map((item) => scrubValue(item, scrub)))
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([key, nested]) => [key, await scrubValue(nested, scrub)] as const))
    return Object.fromEntries(entries)
  }
  return value
}

export const redactObservation = async (input: unknown, options: RedactionOptions): Promise<Record<string, unknown>> => {
  if (!input || typeof input !== 'object') return { userHash: options.userHash }
  const source = input as Record<string, unknown>
  const result: Record<string, unknown> = { userHash: options.userHash }
  if (typeof source.sessionId === 'string') result.sessionId = source.sessionId
  if (typeof source.agentId === 'string') result.agentId = source.agentId
  for (const field of options.fields) {
    const value = getPath(source, field)
    if (value !== undefined) setPath(result, field, await scrubValue(value, options.scrub))
  }
  return result
}
