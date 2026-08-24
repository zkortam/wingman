/** Returns the single row a query must have produced, or throws naming what was missing. */
export function one<T>(rows: readonly T[], what: string): T {
  const row = rows[0]
  if (row === undefined) throw new Error(`${what} not found`)
  return row
}

/** Returns the first row, or null when a query legitimately matched nothing. */
export function optional<T>(rows: readonly T[]): T | null {
  return rows[0] ?? null
}
