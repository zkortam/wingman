import type { Executor, Row } from '@wingman/db'

import { PIPELINE_POLICY } from '../policy.js'
import type { PipelineRepository } from '../repository.js'
import { assertTransition } from '../state.js'
import { createMaintenanceStore } from './maintenance.js'
import { mapAssertion, mapCandidate, mapIncident, mapOutcome, mapRun } from './mappers.js'
import { one, optional } from './read-helpers.js'
import { assertSamePayload } from './write-helpers.js'

type WriteStore = Pick<
  PipelineRepository,
  | 'createOrJoinIncident'
  | 'updateIncident'
  | 'splitIncident'
  | 'saveAssertion'
  | 'promoteAssertion'
  | 'saveRun'
  | 'saveCandidate'
  | 'updateCandidate'
  | 'createOutcome'
  | 'updateOutcome'
  | 'expireIncidents'
  | 'retainEvents'
  | 'saveHandoff'
>

export function createWriteStore(
  sql: Executor,
  read: Pick<PipelineRepository, 'findIncident' | 'getIncident'>,
): WriteStore {
  return {
    ...createMaintenanceStore(sql),

    async createOrJoinIncident(input) {
      const row = one(
        await sql<Row<'incidents'>[]>`
          select * from wingman_join_incident(
            ${input.session.orgId}::uuid,
            ${input.session.agentId}::uuid,
            ${input.key},
            ${input.fingerprint},
            ${input.signalKind},
            ${input.title},
            ${input.session.userHash},
            ${input.session.id}::uuid,
            ${sql.json(input.evidence)}::jsonb,
            ${input.session.endedAt ?? input.session.startedAt}::timestamptz,
            ${input.expiresAt}::timestamptz,
            ${PIPELINE_POLICY.clusterMinimumSessions}
          )
        `,
        'Incident',
      )
      return mapIncident(row)
    },

    async updateIncident(id, expectedState, patch) {
      if (patch.state !== undefined && patch.state !== expectedState)
        assertTransition(expectedState, patch.state)
      const row = optional(
        await sql<Row<'incidents'>[]>`
          update incidents set
            state = ${patch.state ?? sql`state`},
            state_reason = ${patch.stateReason === undefined ? sql`state_reason` : patch.stateReason},
            attempt = ${patch.attempt ?? sql`attempt`},
            verdict = ${patch.verdict === undefined ? sql`verdict` : patch.verdict},
            verdict_confidence = ${
              patch.verdictConfidence === undefined
                ? sql`verdict_confidence`
                : patch.verdictConfidence
            },
            verdict_evidence = ${
              patch.verdictEvidence === undefined
                ? sql`verdict_evidence`
                : patch.verdictEvidence === null
                  ? null
                  : sql.json(patch.verdictEvidence)
            },
            assertion_id = ${patch.assertionId === undefined ? sql`assertion_id` : patch.assertionId}
          where id = ${id} and state = ${expectedState}
          returning *
        `,
      )
      // Compare-and-set: no row means the state moved under us.
      if (row === null) throw new Error(`Incident state changed: ${id}`)
      return mapIncident(row)
    },

    async splitIncident(incident, key, identity) {
      const existing = await read.findIncident(incident.agentId, key)
      if (existing !== null) return existing
      const row = one(
        await sql<Row<'incidents'>[]>`
          insert into incidents (
            org_id, agent_id, key, fingerprint, signal_kind, title, state, state_reason,
            user_hashes, session_ids, evidence_excerpts, expires_at,
            verdict, verdict_confidence, verdict_evidence
          ) values (
            ${incident.orgId}::uuid, ${incident.agentId}::uuid, ${key}, ${incident.fingerprint},
            ${incident.signalKind}, ${incident.title}, 'CLASSIFIED',
            ${`ASSERTION_SPLIT:${identity}`},
            ${incident.userHashes}::text[], ${incident.sessionIds}::uuid[],
            ${sql.json(incident.evidenceExcerpts)}::jsonb, ${incident.expiresAt}::timestamptz,
            ${incident.verdict}, ${incident.verdictConfidence},
            ${incident.verdictEvidence === null ? null : sql.json(incident.verdictEvidence)}
          )
          returning *
        `,
        'Incident',
      )
      return mapIncident(row)
    },

    async saveAssertion(input) {
      const existing = optional(
        await sql<Row<'assertions'>[]>`
          select * from assertions
          where agent_id = ${input.incident.agentId} and identity = ${input.identity}
        `,
      )
      if (existing !== null) {
        const mapped = mapAssertion(existing)
        assertSamePayload('assertion', mapped.definition, input.definition)
        return mapped
      }
      const { kind, ...params } = input.definition
      const row = one(
        await sql<Row<'assertions'>[]>`
          insert into assertions (
            incident_id, agent_id, kind, params, identity, source_session_id, polarity
          ) values (
            ${input.incident.id}::uuid, ${input.incident.agentId}::uuid, ${kind},
            ${sql.json(params)}::jsonb, ${input.identity},
            ${input.sourceSessionId}, ${input.polarity}
          )
          returning *
        `,
        'Assertion',
      )
      return mapAssertion(row)
    },

    async promoteAssertion(id) {
      const row = one(
        await sql<Row<'assertions'>[]>`
          update assertions set polarity = 'positive' where id = ${id} returning *
        `,
        'Assertion',
      )
      return mapAssertion(row)
    },

    async saveRun(input) {
      const existing = optional(
        await sql<Row<'runs'>[]>`
          select * from runs
          where assertion_id = ${input.assertionId}
            and phase = ${input.phase}
            and attempt = ${input.attempt}
            and incident_id is not distinct from ${input.incidentId}
            and candidate_id is not distinct from ${input.candidateId}
        `,
      )
      if (existing !== null) {
        const mapped = mapRun(existing)
        assertSamePayload(
          'runner',
          { n: mapped.n, passCount: mapped.passCount, results: mapped.results },
          { n: input.n, passCount: input.passCount, results: input.results },
        )
        return mapped
      }
      const row = one(
        await sql<Row<'runs'>[]>`
          insert into runs (
            assertion_id, incident_id, phase, attempt, config_version_id, candidate_id,
            n, pass_count, results, tool_executions
          ) values (
            ${input.assertionId}::uuid, ${input.incidentId}, ${input.phase}, ${input.attempt},
            ${input.configVersionId}, ${input.candidateId}, ${input.n}, ${input.passCount},
            ${sql.json(input.results)}::jsonb, ${input.toolExecutions}
          )
          returning *
        `,
        'Run',
      )
      return mapRun(row)
    },

    async saveCandidate(input) {
      const existing = optional(
        await sql<Row<'candidates'>[]>`
          select * from candidates
          where incident_id = ${input.incidentId}
            and attempt = ${input.attempt}
            and iteration = ${input.iteration}
        `,
      )
      if (existing !== null) {
        const mapped = mapCandidate(existing)
        assertSamePayload('fix', mapped.diff, input.diff)
        return mapped
      }
      const row = one(
        await sql<Row<'candidates'>[]>`
          insert into candidates (
            incident_id, diff, diff_bytes, base_version_id, attempt, iteration
          ) values (
            ${input.incidentId}::uuid, ${sql.json(input.diff)}::jsonb, ${input.diffBytes},
            ${input.baseVersionId}::uuid, ${input.attempt}, ${input.iteration}
          )
          returning *
        `,
        'Candidate',
      )
      return mapCandidate(row)
    },

    async updateCandidate(id, patch) {
      const row = one(
        await sql<Row<'candidates'>[]>`
          update candidates set
            state = ${patch.state},
            rejected_reason = ${
              patch.rejectedReason === undefined ? sql`rejected_reason` : patch.rejectedReason
            },
            new_version_id = ${
              patch.newVersionId === undefined ? sql`new_version_id` : patch.newVersionId
            }
          where id = ${id}
          returning *
        `,
        'Candidate',
      )
      return mapCandidate(row)
    },

    async createOutcome(input) {
      const row = one(
        await sql<Row<'outcomes'>[]>`
          insert into outcomes (
            incident_id, candidate_id, scope, applied_to, applied_version_id, window_ends_at
          ) values (
            ${input.incidentId}::uuid, ${input.candidateId}::uuid, ${input.scope},
            ${input.appliedTo}::text[], ${input.versionId}::uuid,
            ${input.windowEndsAt}::timestamptz
          )
          on conflict (incident_id, candidate_id, scope)
            do update set incident_id = excluded.incident_id
          returning *
        `,
        'Outcome',
      )
      return mapOutcome(row)
    },

    async updateOutcome(id, patch) {
      const row = one(
        await sql<Row<'outcomes'>[]>`
          update outcomes set
            status = ${patch.status},
            confirmed_at = ${
              patch.confirmedAt === undefined ? sql`confirmed_at` : patch.confirmedAt
            },
            reverted_at = ${patch.revertedAt === undefined ? sql`reverted_at` : patch.revertedAt}
          where id = ${id}
          returning *
        `,
        'Outcome',
      )
      return mapOutcome(row)
    },

    async saveHandoff(record) {
      await sql`
        insert into pipeline_handoffs (incident_id, payload, remote_thread_id)
        values (
          ${record.incidentId}::uuid, ${sql.json(record.payload)}::jsonb, ${record.remoteThreadId}
        )
        on conflict (incident_id) do nothing
      `
    },
  }
}
