import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'

import postgres from 'postgres'

// Applies db/migrations in filename order, once each, one transaction per file.

const root = resolve(import.meta.dirname, '..')
const directory = join(root, 'db/migrations')

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  process.stderr.write(
    'DATABASE_URL is required.\n' +
      'Start the local database with `pnpm db:up`, then:\n' +
      '  DATABASE_URL=postgres://wingman:wingman@localhost:5432/wingman pnpm db:migrate\n',
  )
  process.exit(1)
}

const sql = postgres(connectionString, { max: 1, onnotice: () => undefined })

try {
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
    await sql.begin(async (tx) => {
      await tx.unsafe(statements)
      await tx`insert into wingman_migrations (filename) values (${file})`
    })
    process.stdout.write(`applied ${file}\n`)
    ran += 1
  }
  process.stdout.write(
    ran === 0
      ? `${String(files.length)} migrations already applied.\n`
      : `Applied ${String(ran)} of ${String(files.length)} migrations.\n`,
  )
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
