import { z } from "zod";

import { LaneSchema } from "./enums.js";

/**
 * The classifier's decision for one turn.
 *
 * Exactly one lane acts, and the discriminant carries only what that lane needs, so a
 * caller cannot read a preference off a FIX or a capability gap off a PERSONALIZE.
 * NONE is the common case and is deliberately explicit — a turn where the user is
 * simply satisfied must be representable, or the classifier will be pushed toward
 * inventing a lane for every turn.
 */
export const LiveClassificationSchema = z.discriminatedUnion("lane", [
  z
    .object({
      lane: z.literal("FIX"),
      expectationId: z.string().uuid(),
      /** CONFIG_DEFECT is repairable here; CODE_DEFECT can only be handed to a human. */
      repairable: z.boolean(),
      rationale: z.string().min(1),
      confidence: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      lane: z.literal("PERSONALIZE"),
      /** The user's own words. Turning this into an imperative config rule needs a
       *  model, so it happens in the lane; the classifier stays pure and testable. */
      phrase: z.string().min(1),
      rationale: z.string().min(1),
      confidence: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      lane: z.literal("ALERT"),
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
      lane: z.literal("NONE"),
      rationale: z.string().min(1),
    })
    .strict(),
]);
export type LiveClassification = z.infer<typeof LiveClassificationSchema>;

export const RecoveryActionSchema = z.enum([
  /** Config changed for this user. Re-run the turn; the agent resolves the new config. */
  "RETRY",
  /** Nothing to re-run. Say the honest thing — used by the ALERT lane. */
  "ACKNOWLEDGE",
  "NONE",
]);
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;

/**
 * What Wingman hands back to the host after a turn.
 *
 * The host is never blocked on the way in, so this is the only channel by which a
 * correction reaches a live conversation, and it is advisory: a host that ignores it
 * degrades to plain observation rather than breaking. `message` is shown to the end
 * user verbatim, which is what makes the retry visible rather than silent.
 */
export const RecoveryDirectiveSchema = z
  .object({
    action: RecoveryActionSchema,
    lane: LaneSchema,
    message: z.string().min(1).nullable(),
    /** Resolve this version on the retry. Null when no config changed. */
    configVersionId: z.string().uuid().nullable(),
    incidentId: z.string().uuid().nullable(),
  })
  .strict();
export type RecoveryDirective = z.infer<typeof RecoveryDirectiveSchema>;

export const NO_RECOVERY: RecoveryDirective = {
  action: "NONE",
  lane: "NONE",
  message: null,
  configVersionId: null,
  incidentId: null,
};
