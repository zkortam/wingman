import { z } from "zod";

export const SignalKindSchema = z.enum([
  "RETRY_REQUEST",
  "RESTATED_CONSTRAINT",
  "ABANDON_RESTART",
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
]);
export type Verdict = z.infer<typeof VerdictSchema>;

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
