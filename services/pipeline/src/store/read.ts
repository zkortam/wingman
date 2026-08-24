import type { Executor, Row } from '@wingman/db'
import { HandoffPayloadSchema } from '@wingman/schema'

import { sessionFingerprint } from '../cluster/index.js'
import type { PipelineSnapshot } from '../domain.js'
import type { PipelineRepository } from '../repository.js'
import { createHistoryStore } from './history.js'
import {
  mapAssertion,
  mapCandidate,
  mapIncident,
  mapOutcome,
  mapRun,
  mapSession,
} from './mappers.js'
import { createMetricsStore } from './metrics.js'
import { QUERY_LIMITS } from './query-limits.js'
import { one, optional } from './read-helpers.js'

type ReadStore = Pick<
  PipelineRepository,
  | 'getSession'
  | 'getBaselines'
  | 'hasMatchingRestart'
  | 'countInFlight'
  | 'getIncident'
  | 'findIncident'
  | 'getAssertion'
  | 'listPositiveAssertions'
  | 'getBaseVersionId'
  | 'getCandidate'
  | 'latestCandidate'
  | 'getOutcomeForIncident'
  | 'findPendingOutcome'
  | 'getSnapshot'
  | 'listIncidents'
  | 'incidentInOrg'
  | 'listOutcomes'
  | 'silentFailureRate'
  | 'gatePrecision'
  | 'getHandoff'
  | 'getWritableConfigPolicy'
  | 'countSignals'
  | 'getIncidentDiff'
>

export function createReadStore(sql: Executor): ReadStore {
  async function getSession(sessionId: string) {
    const session = one(
      await sql<Row<'sessions'>[]>`select * from sessions where id = ${sessionId}`,
      'Session',
    )
    const turns = await sql<Row<'turns'>[]>`
      select * from turns where session_id = ${sessionId} order by idx
    `
    return mapSession(session, [...turns])
  }

  async function getIncident(id: string) {
    return mapIncident(
      one(await sql<Row<'incidents'>[]>`select * from incidents where id = ${id}`, 'Incident'),
    )
  }

  async function readAssertion(id: string) {
    return mapAssertion(
      one(await sql<Row<'assertions'>[]>`select * from assertions where id = ${id}`, 'Assertion'),
    )
  }

  async function latestCandidate(incidentId: string, attempt: number) {
    const row = optional(
      await sql<Row<'candidates'>[]>`
        select * from candidates
        where incident_id = ${incidentId} and attempt = ${attempt}
        order by iteration desc
        limit 1
      `,
    )
    return row === null ? null : mapCandidate(row)
  }

  async function getHandoff(incidentId: string) {
    const row = optional(
      await sql<Row<'pipeline_handoffs'>[]>`
        select * from pipeline_handoffs where incident_id = ${incidentId}
      `,
    )
    return row === null
      ? null
      : {
          incidentId: row.incident_id,
          payload: HandoffPayloadSchema.parse(row.payload),
          remoteThreadId: row.remote_thread_id,
        }
  }

  async function getSnapshot(incidentId: string): Promise<PipelineSnapshot> {
    const incident = await getIncident(incidentId)
    const [runRows, candidateRows, outcomeRows, handoff] = await Promise.all([
      sql<Row<'runs'>[]>`
        select * from runs
        where incident_id = ${incidentId} and attempt = ${incident.attempt}
        order by created_at
      `,
      sql<Row<'candidates'>[]>`
        select * from candidates
        where incident_id = ${incidentId} and attempt = ${incident.attempt}
        order by iteration
      `,
      sql<Row<'outcomes'>[]>`
        select * from outcomes where incident_id = ${incidentId} order by created_at
      `,
      getHandoff(incidentId),
    ])
    const runs = runRows.map(mapRun)
    const lastCandidate = candidateRows.at(-1)
    const lastOutcome = outcomeRows.at(-1)
    return {
      incident,
      assertion: incident.assertionId === null ? null : await readAssertion(incident.assertionId),
      before: runs.find(({ phase }) => phase === 'VERIFY_FAIL') ?? null,
      candidate: lastCandidate === undefined ? null : mapCandidate(lastCandidate),
      after: [...runs].reverse().find(({ phase }) => phase === 'VERIFY_PASS') ?? null,
      positiveSuite: runs.filter(({ phase }) => phase === 'POSITIVE_SUITE'),
      outcome: lastOutcome === undefined ? null : mapOutcome(lastOutcome),
      handoff,
    }
  }

  return {
    ...createHistoryStore(sql),
    ...createMetricsStore(sql),
    getSession,
    getIncident,
    async findIncident(agentId, key) {
      const row = optional(
        await sql<Row<'incidents'>[]>`
          select * from incidents where agent_id = ${agentId} and key = ${key}
        `,
      )
      return row === null ? null : mapIncident(row)
    },
    getAssertion: readAssertion,
    async listPositiveAssertions(agentId) {
      const rows = await sql<Row<'assertions'>[]>`
        select * from assertions where agent_id = ${agentId} and polarity = 'positive'
      `
      return rows.map(mapAssertion)
    },
    async getBaseVersionId(agentId) {
      return one(
        await sql<Pick<Row<'config_versions'>, 'id'>[]>`
          select id from config_versions where agent_id = ${agentId} order by version limit 1
        `,
        'Base version',
      ).id
    },
    async getCandidate(id) {
      return mapCandidate(
        one(await sql<Row<'candidates'>[]>`select * from candidates where id = ${id}`, 'Candidate'),
      )
    },
    latestCandidate,
    async getOutcomeForIncident(incidentId) {
      const row = optional(
        await sql<Row<'outcomes'>[]>`
          select * from outcomes where incident_id = ${incidentId}
          order by created_at desc limit 1
        `,
      )
      return row === null ? null : mapOutcome(row)
    },
    async findPendingOutcome(session) {
      // Scoped to the agent as well as the fingerprint; user hashes are organisation-scoped.
      const row = optional(
        await sql<Row<'outcomes'>[]>`
          select o.* from outcomes o
          join incidents i on i.id = o.incident_id
          where o.status = 'PENDING'
            and o.applied_to @> array[${session.userHash}]::text[]
            and i.agent_id = ${session.agentId}
            and i.fingerprint = ${sessionFingerprint(session)}
          order by o.created_at
          limit 1
        `,
      )
      return row === null ? null : mapOutcome(row)
    },
    getSnapshot,
    async listIncidents(orgId, options) {
      const rows = await sql<Row<'incidents'>[]>`
        select * from incidents
        where org_id = ${orgId}
        order by last_seen desc
        limit ${options?.limit ?? QUERY_LIMITS.listPage}
      `
      return rows.map(mapIncident)
    },
    async incidentInOrg(orgId, incidentId) {
      const rows = await sql<{ present: boolean }[]>`
        select exists (
          select 1 from incidents where id = ${incidentId} and org_id = ${orgId}
        ) as present
      `
      return rows[0]?.present ?? false
    },
    async listOutcomes(orgId) {
      const rows = await sql<Row<'outcomes'>[]>`
        select o.* from outcomes o
        join incidents i on i.id = o.incident_id
        where i.org_id = ${orgId}
        order by o.created_at
        limit ${QUERY_LIMITS.analyticsRows}
      `
      return rows.map(mapOutcome)
    },
    getHandoff,
    async getWritableConfigPolicy(agentId) {
      const row = one(
        await sql<Pick<Row<'agents'>, 'codex_endpoint' | 'max_diff_bytes' | 'writable_paths'>[]>`
          select codex_endpoint, max_diff_bytes, writable_paths from agents where id = ${agentId}
        `,
        'Agent',
      )
      return {
        codexEndpoint: row.codex_endpoint,
        maxDiffBytes: row.max_diff_bytes,
        writablePaths: row.writable_paths,
      }
    },
    async countSignals(sessionId) {
      const rows = await sql<{ count: string }[]>`
        select count(*)::text as count from signals where session_id = ${sessionId}
      `
      return Number(rows[0]?.count ?? 0)
    },
    async getIncidentDiff(incidentId) {
      const incident = await getIncident(incidentId)
      return (await latestCandidate(incidentId, incident.attempt))?.diff ?? null
    },
  }
}
