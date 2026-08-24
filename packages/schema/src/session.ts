import { z } from 'zod'

import { SignalKindSchema } from './enums.js'
import { JsonObjectSchema, JsonValueSchema } from './json.js'
import { IsoDateTimeSchema } from './time.js'

/** `id` is absent on a decision the runner has only proposed; ingest supplies it. */
export const ToolCallSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    args: JsonObjectSchema,
  })
  .strict()
export type ToolCall = z.infer<typeof ToolCallSchema>

export const TurnSchema = z
  .object({
    idx: z.number().int().nonnegative(),
    role: z.enum(['user', 'assistant', 'tool']),
    textRedacted: z.string().nullable(),
    toolCalls: z.array(ToolCallSchema),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
export type Turn = z.infer<typeof TurnSchema>

/** The host's presentation state. Mirrors the `session.*` ContextRef paths in §8. */
export const SessionContextSchema = z
  .object({
    viewFilters: JsonValueSchema.optional(),
    selectedIds: z.array(z.string()).optional(),
    dateRange: JsonValueSchema.optional(),
    lastQuery: z.string().optional(),
  })
  .strict()
export type SessionContext = z.infer<typeof SessionContextSchema>

export const RedactionProofSchema = z
  .object({
    mode: z.literal('allowlist'),
    fields: z.array(z.string().min(1)),
    piiScrubbed: z.literal(true),
    userIdHashed: z.literal(true),
  })
  .strict()
export type RedactionProof = z.infer<typeof RedactionProofSchema>

export const TelemetryCorrelationSchema = z
  .object({
    convention: z.string().min(1).max(64),
    traceId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    spanId: z
      .string()
      .regex(/^[a-f0-9]{16}$/)
      .optional(),
    externalTraceId: z.string().min(1).max(256).optional(),
  })
  .strict()
  .refine(
    ({ traceId, externalTraceId }) => traceId !== undefined || externalTraceId !== undefined,
    { message: 'Telemetry correlation requires a trace identifier' },
  )
export type TelemetryCorrelation = z.infer<typeof TelemetryCorrelationSchema>

export const SessionInputSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    agentId: z.string().uuid(),
    userHash: z.string().regex(/^[a-f0-9]{32}$/),
    personaId: z.string().nullable().optional(),
    configVersionId: z.string().uuid().nullable().optional(),
    viewFilters: JsonValueSchema.optional(),
    selectedIds: z.array(z.string()).optional(),
    dateRange: JsonValueSchema.optional(),
    lastQuery: z.string().optional(),
    userRules: z.array(z.string()).optional(),
    generationCancelled: z.boolean().optional(),
    telemetry: TelemetryCorrelationSchema.optional(),
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.nullable().optional(),
    turns: z.array(TurnSchema).min(1),
    redaction: RedactionProofSchema,
  })
  .strict()
export type SessionInput = z.infer<typeof SessionInputSchema>

export const SignalSchema = z
  .object({
    id: z.string().uuid().optional(),
    sessionId: z.string().uuid(),
    turnIdx: z.number().int().nonnegative(),
    kind: SignalKindSchema,
    confidence: z.number().min(0).max(1),
    baseline: z.number().min(0).max(1).nullable(),
    evidence: JsonObjectSchema,
    detectedAt: IsoDateTimeSchema.optional(),
  })
  .strict()
export type Signal = z.infer<typeof SignalSchema>
