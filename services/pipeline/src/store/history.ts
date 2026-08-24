import type { Executor } from '@wingman/db'
import { SignalKindSchema, type SignalKind } from '@wingman/schema'

import type { Baselines } from '../detect/index.js'
import type { PipelineRepository } from '../repository.js'
import { QUERY_LIMITS } from './query-limits.js'

type HistoryStore = Pick<
  PipelineRepository,
  'getBaselines' | 'hasMatchingRestart' | 'countInFlight'
>

const SIGNAL_KINDS = SignalKindSchema.options
const IN_FLIGHT = ['OPEN', 'CLUSTERED', 'CLASSIFIED', 'ASSERTED', 'CANDIDATE', 'APPLIED']

export function createHistoryStore(sql: Executor): HistoryStore {
  return {
    async getBaselines(session, since): Promise<Baselines> {
      // Rates are computed in SQL; reading every session id back to re-query signals
      // against it produced an identifier list no request line could carry.
      const rows = await sql<
        { kind: string; user_rate: number; cohort_rate: number; user_total: number }[]
      >`
        with cohort as (
          select id, user_hash from sessions
          where agent_id = ${session.agentId}
            and started_at >= ${since.toISOString()}
            and started_at < ${session.startedAt}
          order by started_at desc
          limit ${QUERY_LIMITS.analyticsRows}
        ),
        totals as (
          select
            count(*) filter (where user_hash = ${session.userHash})::float8 as user_total,
            count(*)::float8 as cohort_total
          from cohort
        ),
        signalled as (
          select s.kind,
            count(distinct s.session_id) filter (
              where c.user_hash = ${session.userHash}
            )::float8 as user_hits,
            count(distinct s.session_id)::float8 as cohort_hits
          from signals s join cohort c on c.id = s.session_id
          group by s.kind
        )
        select k.kind,
          totals.user_total,
          case when totals.user_total = 0 then 0
               else coalesce(signalled.user_hits, 0) / totals.user_total end as user_rate,
          case when totals.cohort_total = 0 then 0
               else coalesce(signalled.cohort_hits, 0) / totals.cohort_total end as cohort_rate
        from unnest(${SIGNAL_KINDS as unknown as string[]}::text[]) as k(kind)
        cross join totals
        left join signalled on signalled.kind = k.kind
      `
      // The cohort rate stands in until this user has history of their own.
      const hasUserSessions = (rows[0]?.user_total ?? 0) > 0
      const byKind = new Map(rows.map((row) => [row.kind, row]))
      return Object.fromEntries(
        SIGNAL_KINDS.map((kind) => {
          const row = byKind.get(kind)
          if (row === undefined) return [kind, 0]
          return [kind, hasUserSessions ? row.user_rate : row.cohort_rate]
        }),
      ) as Record<SignalKind, number>
    },

    async hasMatchingRestart(session, withinMinutes) {
      if (session.taskFingerprint === null) return false
      const earliest = new Date(
        new Date(session.startedAt).getTime() - withinMinutes * 60_000,
      ).toISOString()
      const rows = await sql<{ present: boolean }[]>`
        select exists (
          select 1 from sessions
          where agent_id = ${session.agentId}
            and user_hash = ${session.userHash}
            and task_fingerprint = ${session.taskFingerprint}
            and started_at >= ${earliest}
            and started_at < ${session.startedAt}
            and context ->> 'generationCancelled' = 'true'
        ) as present
      `
      return rows[0]?.present ?? false
    },

    async countInFlight(agentId) {
      const rows = await sql<{ count: string }[]>`
        select count(*)::text as count from incidents
        where agent_id = ${agentId} and state = any(${IN_FLIGHT}::text[])
      `
      return Number(rows[0]?.count ?? 0)
    },
  }
}
