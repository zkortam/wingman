export const INCIDENT_STATES = [
  'OPEN',
  'CLUSTERED',
  'CLASSIFIED',
  'ASSERTED',
  'CANDIDATE',
  'APPLIED',
  'CONFIRMED',
  'DISCARDED',
  'PARKED',
  'REVERTED',
  'HUMAN_REVIEW',
  'EXPIRED',
] as const

export type IncidentState = (typeof INCIDENT_STATES)[number]
export type VerdictKind = Verdict
export type SignalKind = SchemaSignalKind

export interface IncidentSummaryView {
  id: string
  title: string
  users: number
  firstSeen: string
  state: IncidentState
}

export interface EvidenceSessionView {
  id: string
  signal: SignalKind
  confidence: number
  baseline: number
  turns: Array<{ role: 'user' | 'assistant'; text: string; signaled?: boolean }>
}

export interface AssertionViewModel {
  kind: 'TOOL_CALLED' | 'TOOL_ARG_EQUALS' | 'OUTPUT_MATCHES_RULE'
  expression: string
  params: Record<string, unknown>
}

export interface RunSummaryView {
  n: number
  passCount: number
}

export interface DiffLineView {
  kind: 'context' | 'add' | 'remove'
  text: string
}

export interface IncidentDetailView extends IncidentSummaryView {
  sessions: number
  stateReason?: string
  verdict?: { kind: VerdictKind; confidence: number; evidence: string[] }
  evidence: EvidenceSessionView[]
  assertion?: AssertionViewModel
  before?: RunSummaryView
  change?: { path: string; bytes: number; lines: DiffLineView[] } | undefined
  after?: (RunSummaryView & { positiveSuitePassed: number; positiveSuiteTotal: number }) | undefined
  scope?: 'USER' | 'GLOBAL' | undefined
  confirmation?: { status: 'PENDING' | 'CONFIRMED' | 'REFUTED' | 'UNOBSERVED'; detail: string }
  appliedAt?: string
  confirmedAt?: string
  handoff?: string
}

export interface IncidentPresentation {
  status: string
  tone: 'neutral' | 'accent' | 'pass' | 'fail' | 'warn' | 'faint'
  show: {
    verdict: boolean
    assertion: boolean
    before: boolean
    change: boolean
    after: boolean
    confirmation: boolean
    handoff: boolean
  }
  actions: Array<'apply' | 'dismiss' | 'reopen' | 'retry' | 'revert' | 'handoff'>
}

export const incidentPresentation = (incident: IncidentDetailView): IncidentPresentation => {
  const early = {
    verdict: false,
    assertion: false,
    before: false,
    change: false,
    after: false,
    confirmation: false,
    handoff: false,
  }
  const common = {
    verdict: Boolean(incident.verdict),
    assertion: Boolean(incident.assertion),
    before: Boolean(incident.before),
    change: Boolean(incident.change),
    after: Boolean(incident.after),
    confirmation: Boolean(incident.confirmation),
    handoff: Boolean(incident.handoff),
  }

  if (incident.state === 'OPEN' || incident.state === 'CLUSTERED') {
    return { status: 'Collecting evidence', tone: 'neutral', show: early, actions: [] }
  }
  if (incident.state === 'CLASSIFIED') {
    return { status: 'Classified', tone: 'neutral', show: { ...early, verdict: Boolean(incident.verdict) }, actions: [] }
  }
  if (incident.state === 'ASSERTED') {
    return {
      status: 'Verifying',
      tone: 'neutral',
      show: { ...early, verdict: Boolean(incident.verdict), assertion: Boolean(incident.assertion), before: true },
      actions: [],
    }
  }
  if (incident.state === 'CANDIDATE') {
    return { status: 'Ready to apply', tone: 'neutral', show: common, actions: ['apply', 'dismiss'] }
  }
  if (incident.state === 'APPLIED') {
    return { status: `Applied to ${incident.users} users, confirming`, tone: 'accent', show: common, actions: ['revert'] }
  }
  if (incident.state === 'CONFIRMED') {
    return { status: 'Assertion verified | User outcome confirmed', tone: 'pass', show: common, actions: ['revert'] }
  }
  if (incident.state === 'REVERTED') {
    return { status: 'Reverted: signal fired again', tone: 'fail', show: common, actions: ['reopen'] }
  }
  if (incident.state === 'EXPIRED') {
    return { status: 'Expired: no recurrence in 14 days', tone: 'faint', show: common, actions: ['reopen'] }
  }
  if (incident.state === 'PARKED') {
    return { status: `Parked at ${incident.stateReason ?? 'pipeline'}`, tone: 'warn', show: common, actions: ['retry', 'dismiss'] }
  }
  if (incident.state === 'HUMAN_REVIEW') {
    const codeDefect = incident.verdict?.kind === 'CODE_DEFECT'
    return {
      status: codeDefect ? 'Handed off to Codex' : 'Needs a human',
      tone: 'warn',
      show: common,
      actions: codeDefect ? ['handoff', 'dismiss'] : ['dismiss'],
    }
  }
  if (incident.stateReason === 'Dismissed by operator') {
    return { status: 'Dismissed by operator', tone: 'faint', show: common, actions: ['reopen'] }
  }
  const wrongRead = incident.before?.passCount === incident.before?.n
  return {
    status: wrongRead ? 'Discarded: our read was wrong' : 'Discarded: model variance',
    tone: 'faint',
    show: { ...common, change: false, after: false, confirmation: false },
    actions: ['reopen'],
  }
}

export const formatRelativeDate = (iso: string, now = new Date()): string => {
  const elapsedMs = now.getTime() - new Date(iso).getTime()
  const hours = Math.max(1, Math.floor(elapsedMs / 3_600_000))
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso))
}
import type { SignalKind as SchemaSignalKind, Verdict } from '@wingman/schema'
