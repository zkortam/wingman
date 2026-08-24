import { resolve } from 'node:path'
import process from 'node:process'

import { applyMigrations, createDatabase } from '@wingman/db'

const directory = resolve(import.meta.dirname, '../db/migrations')

if (!process.env.DATABASE_URL) {
  process.stderr.write(
    'DATABASE_URL is required.\n' +
      'Start the local database with `pnpm db:up`, then:\n' +
      '  DATABASE_URL=postgres://wingman:wingman@localhost:5432/wingman pnpm db:migrate\n',
  )
  process.exit(1)
}

const sql = createDatabase({ max: 1 })
try {
  const ran = await applyMigrations(sql, directory)
  process.stdout.write(
    ran === 0 ? 'All migrations already applied.\n' : `Applied ${String(ran)} migration(s).\n`,
  )
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
