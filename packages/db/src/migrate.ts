import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { Database } from './client.js'

/** Applies every .sql file in `directory` in filename order, once each. */
export async function applyMigrations(sql: Database, directory: string): Promise<number> {
  await sql`
    create table if not exists wingman_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `
  const applied = new Set(
    (await sql<{ filename: string }[]>`select filename from wingman_migrations`).map(
      ({ filename }) => filename,
    ),
  )
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) continue
    const statements = await readFile(join(directory, file), 'utf8')
    // One transaction per file, together with the row recording it, so a failure
    // halfway through leaves nothing behind and the command can be run again.
    await sql.begin(async (tx) => {
      await tx.unsafe(statements)
      await tx`insert into wingman_migrations (filename) values (${file})`
    })
    ran += 1
  }
  return ran
}
