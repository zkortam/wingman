import postgres from 'postgres'

/**
 * Converts Postgres timestamp text to ISO-8601.
 *
 * Postgres renders timestamptz as `2026-08-24 21:50:00.123456+00`: a space
 * instead of T, microseconds, and a two-digit offset. The wire contract and the
 * row types are ISO-8601, so returning the raw column failed schema validation
 * on every timestamp the database produced.
 */
export function toIsoInstant(value: string): string {
  const parts =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(?:([+-]\d{2})(?::?(\d{2}))?|(Z))?$/.exec(
      value,
    )
  if (parts === null) return value
  const [, date, time, fraction, offsetHours, offsetMinutes, zulu] = parts
  const milliseconds = fraction === undefined ? '.000' : `.${fraction.slice(1, 4).padEnd(3, '0')}`
  const offset =
    zulu !== undefined || offsetHours === undefined
      ? 'Z'
      : `${offsetHours}:${offsetMinutes ?? '00'}`
  const parsed = new Date(`${date}T${time}${milliseconds}${offset}`)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

/** A tagged-template SQL client bound to the Wingman schema. */
export type Database = postgres.Sql<{ date: string }>

/** A connection, or a transaction handle. Repository code accepts either. */
export type Executor = Database | postgres.TransactionSql<{ date: string }>

export interface DatabaseOptions {
  connectionString?: string
  /** Connections held open. */
  max?: number
  /** Seconds a connection may sit idle before it is closed. */
  idleTimeout?: number
  onnotice?: (notice: postgres.Notice) => void
}

export function createDatabase(options: DatabaseOptions = {}): Database {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required. Set it to a Postgres connection string, for example postgres://wingman:wingman@localhost:5432/wingman.',
    )
  }
  return postgres(connectionString, {
    max: options.max ?? 10,
    idle_timeout: options.idleTimeout ?? 30,
    connect_timeout: 10,
    // Timestamps cross the wire as ISO-8601 strings, matching the wire contract and the row types.
    types: {
      date: {
        to: 1184,
        from: [1082, 1114, 1184],
        serialize: (value: Date | string) =>
          typeof value === 'string' ? value : value.toISOString(),
        parse: toIsoInstant,
      },
    },
    // Nothing in Wingman prints notices; swallowing them keeps a library quiet inside a host's logs.
    onnotice: options.onnotice ?? (() => undefined),
  })
}

/** Closes the pool. Call from a host's shutdown path, not per request. */
export async function closeDatabase(database: Database): Promise<void> {
  await database.end({ timeout: 5 })
}
