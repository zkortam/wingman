import { resolve } from 'node:path'

import { applyMigrations, createDatabase, type Database } from '@wingman/db'

export interface TestDatabase {
  sql: Database
  stop: () => Promise<void>
}

const MIGRATIONS = resolve(import.meta.dirname, '../../../../../db/migrations')
// The schema declares `turns.embedding vector(1536)`, so a stock image cannot apply it.
const IMAGE = process.env.WINGMAN_TEST_PG_IMAGE ?? 'pgvector/pgvector:pg17'
const START_TIMEOUT_MS = 180_000

/**
 * A migrated Postgres for the suite, or null when neither a database nor Docker
 * is available.
 *
 * An explicit DATABASE_URL wins. Otherwise a throwaway container is started, so
 * the store runs against real SQL anywhere Docker exists - including CI, without
 * the workflow having to declare a service.
 */
export async function startTestDatabase(): Promise<TestDatabase | null> {
  if (process.env.DATABASE_URL) {
    const sql = createDatabase({ max: 4 })
    await applyMigrations(sql, MIGRATIONS)
    return { sql, stop: () => sql.end({ timeout: 5 }) }
  }

  let started
  try {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql')
    const container = new PostgreSqlContainer(IMAGE)
      .withDatabase('wingman')
      .withUsername('wingman')
      .withPassword('wingman')
    started = await withTimeout(container.start(), START_TIMEOUT_MS)
  } catch {
    // No Docker daemon, no image, or no network. The caller reports the skip.
    return null
  }

  const sql = createDatabase({ connectionString: started.getConnectionUri(), max: 4 })
  await applyMigrations(sql, MIGRATIONS)
  return {
    sql,
    stop: async () => {
      await sql.end({ timeout: 5 })
      await started.stop()
    },
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Container start timed out')), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
