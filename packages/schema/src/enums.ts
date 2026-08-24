import { z } from "zod";

export const SignalKindSchema = z.enum([
  "RETRY_REQUEST",
  "RESTATED_CONSTRAINT",
  "ABANDON_RESTART",
  /** "just do it", "stop asking me", "keep it short" — a durable instruction about
   *  how the agent should behave, not a complaint that it got the task wrong. */
  "PREFERENCE_STATED",
]);
export type SignalKind = z.infer<typeof SignalKindSchema>;

export const AssertionKindSchema = z.enum([
  "TOOL_CALLED",
  "TOOL_ARG_EQUALS",
  "OUTPUT_MATCHES_RULE",
]);
export type AssertionKind = z.infer<typeof AssertionKindSchema>;

export const VerdictSchema = z.enum([
  "VARIANCE",
  "PREFERENCE",
  "CONFIG_DEFECT",
  "CODE_DEFECT",
  /** The agent has no way to do what was asked. Not a defect: there is nothing to
   *  repair, so the only honest moves are to tell the user and count the demand. */
  "UNSUPPORTED",
]);
export type Verdict = z.infer<typeof VerdictSchema>;

/** Where the classifier routes a turn. Exactly one lane acts per turn. */
export const LaneSchema = z.enum(["FIX", "PERSONALIZE", "ALERT", "NONE"]);
export type Lane = z.infer<typeof LaneSchema>;

export const ExpectationStateSchema = z.enum([
  "PENDING",
  "MET",
  "MISSED",
  "UNSUPPORTED",
  "ABANDONED",
]);
export type ExpectationState = z.infer<typeof ExpectationStateSchema>;

export const PreferenceStateSchema = z.enum(["ACTIVE", "REVOKED"]);
export type PreferenceState = z.infer<typeof PreferenceStateSchema>;

export const CapabilityStateSchema = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "PLANNED",
  "SHIPPED",
  "DECLINED",
]);
export type CapabilityState = z.infer<typeof CapabilityStateSchema>;

export const ScopeSchema = z.enum(["USER", "GLOBAL"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const IncidentStateSchema = z.enum([
  "OPEN",
  "CLUSTERED",
  "CLASSIFIED",
  "ASSERTED",
  "CANDIDATE",
  "APPLIED",
  "CONFIRMED",
  "DISCARDED",
  "PARKED",
  "REVERTED",
  "HUMAN_REVIEW",
  "EXPIRED",
]);
export type IncidentState = z.infer<typeof IncidentStateSchema>;

export const OutcomeStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "REFUTED",
  "UNOBSERVED",
  "REVERTED",
]);
export type OutcomeStatus = z.infer<typeof OutcomeStatusSchema>;
