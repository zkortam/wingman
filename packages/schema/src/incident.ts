import { z } from 'zod'

import { AssertionDefinitionSchema } from './assertion.js'
import { AgentConfigSchema, ConfigDiffSchema } from './config.js'
import { IncidentStateSchema, OutcomeStatusSchema, ScopeSchema, VerdictSchema } from './enums.js'
import { JsonObjectSchema } from './json.js'
import { ToolCallSchema } from './session.js'
import { IsoDateTimeSchema } from './time.js'

export const ConfigVersionSchema = z
  .object({
    id: z.string().uuid(),
    agentId: z.string().uuid(),
    version: z.number().int().positive(),
    config: AgentConfigSchema,
    incidentId: z.string().uuid().nullable(),
    signature: z.string().min(1),
    createdBy: z.enum(['BASE', 'PIPELINE', 'HUMAN']),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
export type ConfigVersion = z.infer<typeof ConfigVersionSchema>

export const AssertionSchema = z
  .object({
    id: z.string().uuid(),
    incidentId: z.string().uuid().nullable(),
    agentId: z.string().uuid(),
    definition: AssertionDefinitionSchema,
    identity: z.string().length(64),
    sourceSessionId: z.string().uuid().nullable(),
    polarity: z.enum(['positive', 'negative']),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
export type Assertion = z.infer<typeof AssertionSchema>

export const RunResultSchema = z
  .object({
    passed: z.boolean(),
    toolCalls: z.array(ToolCallSchema),
    text: z.string().nullable(),
    cassetteKey: z.string().min(1),
  })
  .strict()
export type RunResult = z.infer<typeof RunResultSchema>

export const RunSchema = z
  .object({
    id: z.string().uuid(),
    assertionId: z.string().uuid(),
    incidentId: z.string().uuid().nullable(),
    phase: z.enum(['VERIFY_FAIL', 'VERIFY_PASS', 'POSITIVE_SUITE']),
    attempt: z.number().int().positive(),
    configVersionId: z.string().uuid().nullable(),
    candidateId: z.string().uuid().nullable(),
    n: z.number().int().positive(),
    passCount: z.number().int().nonnegative(),
    results: z.array(RunResultSchema),
    toolExecutions: z.literal(0),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
export type Run = z.infer<typeof RunSchema>

export const CandidateSchema = z
  .object({
    id: z.string().uuid(),
    incidentId: z.string().uuid(),
    diff: ConfigDiffSchema,
    diffBytes: z.number().int().nonnegative(),
    baseVersionId: z.string().uuid(),
    newVersionId: z.string().uuid().nullable(),
    attempt: z.number().int().positive(),
    iteration: z.number().int().min(1).max(3),
    state: z.enum(['PROPOSED', 'VERIFIED', 'REJECTED', 'APPLIED']),
    rejectedReason: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
export type Candidate = z.infer<typeof CandidateSchema>

export const OutcomeSchema = z
  .object({
    id: z.string().uuid(),
    incidentId: z.string().uuid(),
    candidateId: z.string().uuid(),
    scope: ScopeSchema,
    appliedTo: z.array(z.string()),
    appliedVersionId: z.string().uuid(),
    status: OutcomeStatusSchema,
    windowEndsAt: IsoDateTimeSchema,
    confirmedAt: IsoDateTimeSchema.nullable(),
    revertedAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
export type Outcome = z.infer<typeof OutcomeSchema>

export const EvidenceExcerptSchema = z
  .object({
    sessionId: z.string().uuid(),
    turnIdx: z.number().int().nonnegative(),
    kind: z.string(),
    confidence: z.number().min(0).max(1),
    baseline: z.number().min(0).max(1).nullable(),
    turns: z.array(z.object({ role: z.string(), textRedacted: z.string().nullable() }).strict()),
  })
  .strict()
export type EvidenceExcerpt = z.infer<typeof EvidenceExcerptSchema>

export const IncidentSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    affectedUsers: z.number().int().nonnegative(),
    sessionCount: z.number().int().nonnegative(),
    firstSeen: IsoDateTimeSchema,
    lastSeen: IsoDateTimeSchema,
    state: IncidentStateSchema,
    stateReason: z.string().nullable(),
    verdict: VerdictSchema.nullable(),
  })
  .strict()
export type IncidentSummary = z.infer<typeof IncidentSummarySchema>

export const HandoffPayloadSchema = z
  .object({
    task: z.string().min(1),
    context: z
      .object({
        failingAssertion: AssertionDefinitionSchema,
        failingRuns: z.array(RunResultSchema),
        affectedUsers: z.array(z.string()),
        sessions: z.array(z.string().uuid()),
        priorAttempts: z.array(z.string()),
      })
      .strict(),
    constraints: z
      .object({ maxIterations: z.literal(5), requireTestPass: z.literal(true) })
      .strict(),
  })
  .strict()
export type HandoffPayload = z.infer<typeof HandoffPayloadSchema>

export const IncidentDetailSchema = IncidentSummarySchema.extend({
  attempt: z.number().int().positive(),
  evidence: z.array(EvidenceExcerptSchema),
  verdictConfidence: z.number().min(0).max(1).nullable(),
  verdictEvidence: JsonObjectSchema.nullable(),
  assertion: AssertionSchema.nullable(),
  before: RunSchema.nullable(),
  candidate: CandidateSchema.nullable(),
  after: RunSchema.nullable(),
  positiveSuite: z.array(RunSchema),
  outcome: OutcomeSchema.nullable(),
  handoff: HandoffPayloadSchema.nullable(),
}).strict()
export type IncidentDetail = z.infer<typeof IncidentDetailSchema>
