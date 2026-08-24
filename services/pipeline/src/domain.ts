import type {
  Assertion,
  AssertionContext,
  Candidate,
  ConfigDiff,
  EvidenceExcerpt,
  HandoffPayload,
  IncidentState,
  JsonValue,
  Outcome,
  Run,
  SessionInput,
  Signal,
  SignalKind,
  Verdict,
} from '@wingman/schema'

export type ObservedTurn = SessionInput['turns'][number] & {
  embedding: number[] | null
}

export interface ObservedSession extends Omit<SessionInput, 'redaction' | 'turns'> {
  taskFingerprint: string | null
  turns: ObservedTurn[]
}

export interface IncidentRecord {
  id: string
  orgId: string
  agentId: string
  key: string
  fingerprint: string
  signalKind: SignalKind
  title: string
  state: IncidentState
  stateReason: string | null
  attempt: number
  verdict: Verdict | null
  verdictConfidence: number | null
  verdictEvidence: Record<string, JsonValue> | null
  assertionId: string | null
  userHashes: string[]
  sessionIds: string[]
  evidenceExcerpts: EvidenceExcerpt[]
  firstSeen: string
  lastSeen: string
  expiresAt: string | null
}

export interface GateDecision {
  verdict: Verdict
  confidence: number
  evidence: Record<string, JsonValue>
  policyConflict: boolean
  refusalReason: string | null
}

export interface RunRequest {
  incident: IncidentRecord
  assertion: Assertion
  context: AssertionContext
  session: ObservedSession
}

export interface CandidateInput {
  incidentId: string
  diff: ConfigDiff
  diffBytes: number
  baseVersionId: string
  attempt: number
  iteration: number
}

export interface HandoffRecord {
  incidentId: string
  payload: HandoffPayload
  remoteThreadId: string | null
}

export interface PipelineSnapshot {
  incident: IncidentRecord
  assertion: Assertion | null
  before: Run | null
  candidate: Candidate | null
  after: Run | null
  positiveSuite: Run[]
  outcome: Outcome | null
  handoff: HandoffRecord | null
}

export interface DetectedSession {
  session: ObservedSession
  signals: Signal[]
  primaryKind: SignalKind
}
