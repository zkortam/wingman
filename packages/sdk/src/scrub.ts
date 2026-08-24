export async function scrubValue(
  value: unknown,
  scrub: (text: string) => Promise<string>,
): Promise<unknown> {
  if (typeof value === 'string') return scrub(value)
  if (Array.isArray(value)) {
    return Promise.all(value.map((entry) => scrubValue(entry, scrub)))
  }
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(
        async ([key, entry]) => [key, await scrubValue(entry, scrub)] as const,
      ),
    )
    return Object.fromEntries(entries)
  }
  return value
}
