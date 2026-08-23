import type {
  Assertion,
  AssertionDefinition,
  Candidate,
  ConfigDiff,
  EvidenceExcerpt,
  IncidentState,
  JsonValue,
  Outcome,
  Run,
  Scope,
  SignalKind,
  Verdict,
} from "@wingman/schema";

import type {
  CandidateInput,
  HandoffRecord,
  IncidentRecord,
  ObservedSession,
  PipelineSnapshot,
} from "./domain.js";
import type { Baselines } from "./detect/index.js";

export interface IncidentPatch {
  state?: IncidentState;
  stateReason?: string | null;
  attempt?: number;
  verdict?: Verdict | null;
  verdictConfidence?: number | null;
  verdictEvidence?: Record<string, JsonValue> | null;
  assertionId?: string | null;
}

export interface RunInput {
  assertionId: string;
  incidentId: string | null;
  phase: "VERIFY_FAIL" | "VERIFY_PASS" | "POSITIVE_SUITE";
  attempt: number;
  configVersionId: string | null;
  candidateId: string | null;
  n: number;
  passCount: number;
  results: Run["results"];
  toolExecutions: 0;
}

export interface PipelineRepository {
  getSession(sessionId: string): Promise<ObservedSession>;
  getBaselines(session: ObservedSession, since: Date): Promise<Baselines>;
  hasMatchingRestart(
    session: ObservedSession,
    withinMinutes: number,
  ): Promise<boolean>;
  countInFlight(agentId: string): Promise<number>;
  createOrJoinIncident(input: {
    session: ObservedSession;
    key: string;
    fingerprint: string;
    signalKind: SignalKind;
    title: string;
    evidence: EvidenceExcerpt[];
    expiresAt: string;
  }): Promise<IncidentRecord>;
  getIncident(id: string): Promise<IncidentRecord>;
  findIncident(agentId: string, key: string): Promise<IncidentRecord | null>;
  updateIncident(
    id: string,
    expectedState: IncidentState,
    patch: IncidentPatch,
  ): Promise<IncidentRecord>;
  splitIncident(
    incident: IncidentRecord,
    key: string,
    assertionIdentity: string,
  ): Promise<IncidentRecord>;
  saveAssertion(input: {
    incident: IncidentRecord;
    definition: AssertionDefinition;
    identity: string;
    sourceSessionId: string | null;
    polarity: "positive" | "negative";
  }): Promise<Assertion>;
  getAssertion(id: string): Promise<Assertion>;
  listPositiveAssertions(agentId: string): Promise<Assertion[]>;
  saveRun(input: RunInput): Promise<Run>;
  getBaseVersionId(agentId: string): Promise<string>;
  saveCandidate(input: CandidateInput): Promise<Candidate>;
  getCandidate(id: string): Promise<Candidate>;
  latestCandidate(
    incidentId: string,
    attempt: number,
  ): Promise<Candidate | null>;
  updateCandidate(
    id: string,
    patch: {
      state: Candidate["state"];
      rejectedReason?: string | null;
      newVersionId?: string | null;
    },
  ): Promise<Candidate>;
  createOutcome(input: {
    incidentId: string;
    candidateId: string;
    scope: Scope;
    appliedTo: string[];
    versionId: string;
    windowEndsAt: string;
  }): Promise<Outcome>;
  getOutcomeForIncident(incidentId: string): Promise<Outcome | null>;
  updateOutcome(
    id: string,
    patch: {
      status: Outcome["status"];
      confirmedAt?: string | null;
      revertedAt?: string | null;
    },
  ): Promise<Outcome>;
  findPendingOutcome(session: ObservedSession): Promise<Outcome | null>;
  getSnapshot(incidentId: string): Promise<PipelineSnapshot>;
  listSnapshots(orgId: string): Promise<PipelineSnapshot[]>;
  listOutcomes(orgId: string): Promise<Outcome[]>;
  silentFailureRate(orgId: string, start: Date, end: Date): Promise<number>;
  gatePrecision(orgId: string): Promise<{ precision: number; n: number }>;
  expireIncidents(now: Date): Promise<number>;
  retainEvents(before: Date): Promise<number>;
  saveHandoff(record: HandoffRecord): Promise<void>;
  getHandoff(incidentId: string): Promise<HandoffRecord | null>;
  getWritableConfigPolicy(agentId: string): Promise<{
    codexEndpoint: string | null;
    maxDiffBytes: number;
    writablePaths: string[];
  }>;
  countSignals(sessionId: string): Promise<number>;
  getIncidentDiff(incidentId: string): Promise<ConfigDiff | null>;
}
