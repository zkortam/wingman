import type { Executor } from '@wingman/db'
import { canonicalJSON, type ConfigDiff, type Ledger } from '@wingman/schema'

export class PostgresLedger implements Ledger {
  constructor(private readonly sql: Executor) {}

  async record(event: {
    incidentId: string
    fingerprint: string
    diff: ConfigDiff
    outcome: string
  }): Promise<void> {
    await this.sql`
      insert into pipeline_ledger (incident_id, fingerprint, diff, outcome)
      values (
        ${event.incidentId}::uuid, ${event.fingerprint},
        ${this.sql.json(event.diff)}::jsonb, ${event.outcome}
      )
    `
  }

  async priorArt(fingerprint: string): Promise<Array<{ summary: string; outcome: string }>> {
    const rows = await this.sql<{ diff: unknown; outcome: string }[]>`
      select diff, outcome from pipeline_ledger
      where fingerprint = ${fingerprint}
      order by created_at desc
      limit 20
    `
    return rows.map((row) => ({ summary: canonicalJSON(row.diff), outcome: row.outcome }))
  }
}
