import postgres from 'postgres'

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
        parse: (value: string) => value,
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
