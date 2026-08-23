const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([first], [second]) => first.localeCompare(second)).map(([key, nested]) => [key, normalize(nested)]))
}

export const canonicalJSON = (value: unknown): string => JSON.stringify(normalize(value))
