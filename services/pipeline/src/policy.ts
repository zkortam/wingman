export function positiveDuration(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const PIPELINE_POLICY = {
  assertionAttempts: 3,
  baselineWindowDays: 30,
  clusterMinimumSessions: 2,
  confirmationWindowHours: 24,
  gateMinimumConfidence: 0.75,
  incidentExpiryDays: 14,
  maxFixIterations: 3,
  maxFixTimeMs: 60_000,
  maxInFlightIncidents: 3,
  /**
   * Budget for one live model call. Wingman sits beside a conversation a person is
   * waiting on, so a slow answer is worse than no answer and both paths fail open.
   *
   * Configurable because the right number depends on the transport. A hosted endpoint
   * answers well inside a second, while a local CLI spawning a process takes several,
   * and a budget tuned for one silently disables the feature on the other.
   */
  maxExpectationMs: positiveDuration(process.env.WINGMAN_MAX_EXPECTATION_MS, 1_500),
  maxLiveTurnMs: positiveDuration(process.env.WINGMAN_MAX_LIVE_TURN_MS, 2_500),
  maxToolReviewMs: positiveDuration(process.env.WINGMAN_MAX_TOOL_REVIEW_MS, 1_000),
  restartWindowMinutes: 5,
  retentionDays: 30,
  signalMinimumConfidence: 0.5,
  verificationSamples: 5,
  verifyFailMaximumPasses: 1,
  verifyPassMinimumPasses: 4,
} as const;

export const PIPELINE_MODELS = {
  assertion: process.env.WINGMAN_ASSERTION_MODEL ?? "gpt-5.4-mini",
  embedding: process.env.WINGMAN_EMBEDDING_MODEL ?? "text-embedding-3-small",
  expectation: process.env.WINGMAN_EXPECTATION_MODEL ?? "gpt-5.4-mini",
  fix: process.env.WINGMAN_FIX_MODEL,
  gate: process.env.WINGMAN_GATE_MODEL ?? "gpt-5.4-mini",
  review: process.env.WINGMAN_REVIEW_MODEL ?? "gpt-5.4-mini",
} as const;
