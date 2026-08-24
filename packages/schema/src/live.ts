import { z } from 'zod'

import { LaneSchema } from './enums.js'

/** The classifier's decision for one turn. */
export const LiveClassificationSchema = z.discriminatedUnion('lane', [
  z
    .object({
      lane: z.literal('FIX'),
      expectationId: z.string().uuid(),
      /** CONFIG_DEFECT is repairable here; CODE_DEFECT can only be handed to a human. */
      repairable: z.boolean(),
      rationale: z.string().min(1),
      confidence: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      lane: z.literal('PERSONALIZE'),
      /** The user's own words. Turning this into an imperative config rule needs a
       *  model, so it happens in the lane; the classifier stays pure and testable. */
      phrase: z.string().min(1),
      rationale: z.string().min(1),
      confidence: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      lane: z.literal('ALERT'),
      expectationId: z.string().uuid(),
      /** Stable across users so demand for the same gap accumulates. */
      capabilityKey: z.string().min(1),
      title: z.string().min(1),
      rationale: z.string().min(1),
      confidence: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      lane: z.literal('NONE'),
      rationale: z.string().min(1),
    })
    .strict(),
])
export type LiveClassification = z.infer<typeof LiveClassificationSchema>

export const RecoveryActionSchema = z.enum([
  /** Config changed for this user. Re-run the turn; the agent resolves the new config. */
  'RETRY',
  /** Nothing to re-run. Say the honest thing — used by the ALERT lane. */
  'ACKNOWLEDGE',
  'NONE',
])
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>

/** What Wingman hands back to the host after a turn. */
export const RecoveryDirectiveSchema = z
  .object({
    action: RecoveryActionSchema,
    lane: LaneSchema,
    message: z.string().min(1).nullable(),
    /** Resolve this version on the retry. Null when no config changed. */
    configVersionId: z.string().uuid().nullable(),
    incidentId: z.string().uuid().nullable(),
  })
  .strict()
export type RecoveryDirective = z.infer<typeof RecoveryDirectiveSchema>

export const NO_RECOVERY: RecoveryDirective = {
  action: 'NONE',
  lane: 'NONE',
  message: null,
  configVersionId: null,
  incidentId: null,
}
