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
  fix: process.env.WINGMAN_FIX_MODEL,
  gate: process.env.WINGMAN_GATE_MODEL ?? "gpt-5.4-mini",
} as const;
