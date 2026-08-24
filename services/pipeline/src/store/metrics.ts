import type { Executor } from '@wingman/db'

import type { PipelineRepository } from '../repository.js'
import { QUERY_LIMITS } from './query-limits.js'

type MetricsStore = Pick<PipelineRepository, 'silentFailureRate' | 'gatePrecision'>

export function createMetricsStore(sql: Executor): MetricsStore {
  return {
    async silentFailureRate(orgId, start, end) {
      const rows = await sql<{ signalled: string; total: string }[]>`
        with window_sessions as (
          select id from sessions
          where org_id = ${orgId}
            and started_at >= ${start.toISOString()}
            and started_at < ${end.toISOString()}
          limit ${QUERY_LIMITS.analyticsRows}
        )
        select
          (select count(distinct s.session_id) from signals s
             join window_sessions w on w.id = s.session_id)::text as signalled,
          (select count(*) from window_sessions)::text as total
      `
      const total = Number(rows[0]?.total ?? 0)
      return total === 0 ? 0 : Number(rows[0]?.signalled ?? 0) / total
    },

    async gatePrecision(orgId) {
      // One aggregate, rather than a query per incident.
      const rows = await sql<{ failed: string; total: string }[]>`
        select
          count(*) filter (where r.pass_count <= 1)::text as failed,
          count(*)::text as total
        from incidents i
        join runs r
          on r.incident_id = i.id
         and r.attempt = i.attempt
         and r.phase = 'VERIFY_FAIL'
        where i.org_id = ${orgId} and i.assertion_id is not null
      `
      const total = Number(rows[0]?.total ?? 0)
      return { precision: total === 0 ? 0 : Number(rows[0]?.failed ?? 0) / total, n: total }
    },
  }
}
