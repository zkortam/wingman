import type { Row } from '@wingman/db'
import {
  AssertionDefinitionSchema,
  AssertionSchema,
  CandidateSchema,
  EvidenceExcerptSchema,
  IncidentStateSchema,
  JsonValueSchema,
  OutcomeSchema,
  RunResultSchema,
  RunSchema,
  SignalKindSchema,
  TelemetryCorrelationSchema,
  ToolCallSchema,
  VerdictSchema,
  type Assertion,
  type Candidate,
  type Outcome,
  type Run,
} from '@wingman/schema'
import { z } from 'zod'

import type { IncidentRecord, ObservedSession } from '../domain.js'

export type { Row }

const ContextSchema = z
  .object({
    viewFilters: z.unknown().optional(),
    selectedIds: z.array(z.string()).optional(),
    dateRange: z.unknown().optional(),
    lastQuery: z.string().optional(),
    userRules: z.array(z.string()).optional(),
    generationCancelled: z.boolean().optional(),
    telemetry: z.unknown().optional(),
  })
  .passthrough()

export function mapSession(row: Row<'sessions'>, turns: Row<'turns'>[]): ObservedSession {
  const context = ContextSchema.parse(row.context)
  return {
    id: row.id,
    orgId: row.org_id,
    agentId: row.agent_id,
    userHash: row.user_hash,
    personaId: row.persona_id,
    configVersionId: row.config_version_id,
    taskFingerprint: row.task_fingerprint,
    viewFilters: asJson(context.viewFilters),
    selectedIds: context.selectedIds,
    dateRange: asJson(context.dateRange),
    lastQuery: context.lastQuery,
    userRules: context.userRules,
    generationCancelled: context.generationCancelled,
    telemetry:
      context.telemetry === undefined
        ? undefined
        : TelemetryCorrelationSchema.parse(context.telemetry),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    turns: turns.map((turn) => ({
      idx: turn.idx,
      role: z.enum(['user', 'assistant', 'tool']).parse(turn.role),
      textRedacted: turn.text_redacted,
      toolCalls: z.array(ToolCallSchema).parse(turn.tool_calls),
      embedding: parseVector(turn.embedding),
      createdAt: turn.created_at,
    })),
  }
}

export function mapIncident(row: Row<'incidents'>): IncidentRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    agentId: row.agent_id,
    key: row.key,
    fingerprint: row.fingerprint,
    signalKind: SignalKindSchema.parse(row.signal_kind),
    title: row.title,
    state: IncidentStateSchema.parse(row.state),
    stateReason: row.state_reason,
    attempt: row.attempt,
    verdict: row.verdict === null ? null : VerdictSchema.parse(row.verdict),
    verdictConfidence: row.verdict_confidence,
    verdictEvidence:
      row.verdict_evidence === null ? null : z.record(JsonValueSchema).parse(row.verdict_evidence),
    assertionId: row.assertion_id,
    userHashes: row.user_hashes,
    sessionIds: row.session_ids,
    evidenceExcerpts: z.array(EvidenceExcerptSchema).parse(row.evidence_excerpts),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    expiresAt: row.expires_at,
  }
}

export function mapAssertion(row: Row<'assertions'>): Assertion {
  return AssertionSchema.parse({
    id: row.id,
    incidentId: row.incident_id,
    agentId: row.agent_id,
    definition: AssertionDefinitionSchema.parse({
      kind: row.kind,
      ...(row.params as object),
    }),
    identity: row.identity,
    sourceSessionId: row.source_session_id,
    polarity: row.polarity,
    createdAt: row.created_at,
  })
}

export function mapRun(row: Row<'runs'>): Run {
  return RunSchema.parse({
    id: row.id,
    assertionId: row.assertion_id,
    incidentId: row.incident_id,
    phase: row.phase,
    attempt: row.attempt,
    configVersionId: row.config_version_id,
    candidateId: row.candidate_id,
    n: row.n,
    passCount: row.pass_count,
    results: z.array(RunResultSchema).parse(row.results),
    toolExecutions: row.tool_executions,
    createdAt: row.created_at,
  })
}

export function mapCandidate(row: Row<'candidates'>): Candidate {
  return CandidateSchema.parse({
    id: row.id,
    incidentId: row.incident_id,
    diff: row.diff,
    diffBytes: row.diff_bytes,
    baseVersionId: row.base_version_id,
    newVersionId: row.new_version_id,
    attempt: row.attempt,
    iteration: row.iteration,
    state: row.state,
    rejectedReason: row.rejected_reason,
    createdAt: row.created_at,
  })
}

export function mapOutcome(row: Row<'outcomes'>): Outcome {
  return OutcomeSchema.parse({
    id: row.id,
    incidentId: row.incident_id,
    candidateId: row.candidate_id,
    scope: row.scope,
    appliedTo: row.applied_to,
    appliedVersionId: row.applied_version_id,
    status: row.status,
    windowEndsAt: row.window_ends_at,
    confirmedAt: row.confirmed_at,
    revertedAt: row.reverted_at,
    createdAt: row.created_at,
  })
}

function parseVector(value: string | null): number[] | null {
  if (value === null) return null
  return value.replace(/^\[/, '').replace(/]$/, '').split(',').filter(Boolean).map(Number)
}

function asJson(value: unknown) {
  return value === undefined ? undefined : JsonValueSchema.parse(value)
}
