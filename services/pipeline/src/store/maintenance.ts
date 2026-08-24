import type { Executor } from '@wingman/db'

import type { PipelineRepository } from '../repository.js'
import { statesTransitionableTo } from '../state.js'
import { QUERY_LIMITS } from './query-limits.js'

type MaintenanceStore = Pick<PipelineRepository, 'expireIncidents' | 'retainEvents'>

// Derived from the state machine rather than hand-listed. The previous negative list
// also expired PARKED and HUMAN_REVIEW, which cannot legally reach EXPIRED - it took
// incidents waiting on a human out of the queue and told the operator they had lapsed.
const EXPIRABLE = statesTransitionableTo('EXPIRED')

export function createMaintenanceStore(sql: Executor): MaintenanceStore {
  return {
    async expireIncidents(now) {
      const rows = await sql<{ id: string }[]>`
        update incidents
        set state = 'EXPIRED', state_reason = 'NO_RECURRENCE_14D'
        where expires_at < ${now.toISOString()}
          and state = any(${EXPIRABLE as unknown as string[]}::text[])
        returning id
      `
      return rows.length
    },

    async retainEvents(before) {
      // One transaction: a session must not survive the deletion of its own turns.
      return sql.begin(async (tx) => {
        const sessions = await tx<{ id: string }[]>`
          select id from sessions
          where ingested_at < ${before.toISOString()}
          order by ingested_at
          limit ${QUERY_LIMITS.analyticsRows}
          for update
        `
        if (sessions.length === 0) return 0
        const ids = sessions.map(({ id }) => id)
        await tx`delete from turns where session_id = any(${ids}::uuid[])`
        await tx`delete from signals where session_id = any(${ids}::uuid[])`
        await tx`delete from sessions where id = any(${ids}::uuid[])`
        return ids.length
      })
    },
  }
}
