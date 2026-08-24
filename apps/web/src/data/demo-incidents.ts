import type { IncidentDetailView, IncidentSummaryView } from '../domain/incidents'

const now = Date.now()
const ago = (hours: number): string => new Date(now - hours * 3_600_000).toISOString()

const evidence = [
  {
    id: 'sess_7c91',
    signal: 'RETRY_REQUEST' as const,
    confidence: 0.81,
    baseline: 0.12,
    turns: [
      { role: 'user' as const, text: 'Export these opportunities to CSV.' },
      { role: 'assistant' as const, text: 'Exported 50 opportunities.' },
      { role: 'user' as const, text: 'No, just the ones I have filtered.', signaled: true },
    ],
  },
  {
    id: 'sess_04fd',
    signal: 'RESTATED_CONSTRAINT' as const,
    confidence: 0.77,
    baseline: 0.18,
    turns: [
      { role: 'user' as const, text: 'Only Negotiation-stage opportunities.' },
      { role: 'assistant' as const, text: 'The export contains all opportunities.' },
      { role: 'user' as const, text: 'I said only Negotiation.', signaled: true },
    ],
  },
  {
    id: 'sess_b322',
    signal: 'ABANDON_RESTART' as const,
    confidence: 0.74,
    baseline: 0.09,
    turns: [
      { role: 'user' as const, text: 'Export my filtered view.' },
      { role: 'assistant' as const, text: 'Exported all 50 opportunities.' },
      { role: 'user' as const, text: 'Cancel.', signaled: true },
    ],
  },
]

const candidate: IncidentDetailView = {
  id: 'OC-1042',
  title: 'Export ignores active filters',
  users: 12,
  sessions: 19,
  firstSeen: ago(2),
  state: 'CANDIDATE',
  evidence,
  verdict: {
    kind: 'CONFIG_DEFECT',
    confidence: 0.86,
    evidence: [
      'The export tool description does not mention active view filters.',
      'The user explicitly scoped the task to the visible view.',
      'Prior successful traces pass filters to export_records.',
    ],
  },
  assertion: {
    kind: 'TOOL_ARG_EQUALS',
    expression: 'export_records.filters == session.viewFilters',
    params: { tool: 'export_records', arg: 'filters', expected: { $ref: 'session.viewFilters' } },
  },
  before: { n: 5, passCount: 0 },
  change: {
    path: 'tools[export_records].description',
    bytes: 214,
    lines: [
      { kind: 'remove', text: 'Exports records from the current object.' },
      { kind: 'add', text: "Exports records. Pass the caller's active view filters" },
      { kind: 'add', text: 'in `filters` so the export matches the visible view.' },
    ],
  },
  after: { n: 5, passCount: 5, positiveSuitePassed: 41, positiveSuiteTotal: 41 },
  scope: 'USER',
}

const variants: IncidentDetailView[] = [
  candidate,
  {
    ...candidate,
    id: 'OC-1038',
    title: 'Search returns closed opportunities',
    users: 7,
    sessions: 11,
    firstSeen: ago(9),
    state: 'DISCARDED',
    verdict: {
      kind: 'VARIANCE',
      confidence: 0.71,
      evidence: ['The unchanged config passed two of five identical assertions.'],
    },
    before: { n: 5, passCount: 2 },
    change: undefined,
    after: undefined,
    scope: undefined,
  },
  {
    ...candidate,
    id: 'OC-1031',
    title: 'Summary drops the date range',
    users: 4,
    sessions: 6,
    firstSeen: ago(27),
    state: 'APPLIED',
    appliedAt: ago(1),
    verdict: {
      kind: 'PREFERENCE',
      confidence: 0.91,
      evidence: ['The user restated the same date constraint twice.'],
    },
    confirmation: { status: 'PENDING', detail: 'Confirmation window ends in 21h' },
  },
  {
    ...candidate,
    id: 'OC-1029',
    title: 'Refund tool runs without confirmation',
    users: 3,
    sessions: 4,
    firstSeen: ago(31),
    state: 'HUMAN_REVIEW',
    stateReason: 'Tool behavior requires a code change in the customer environment.',
    verdict: {
      kind: 'CODE_DEFECT',
      confidence: 0.93,
      evidence: ['The tool executes before the required confirmation boundary.'],
    },
    change: undefined,
    after: undefined,
    scope: undefined,
    handoff: '{ "task": "Require confirmation before refund execution", "requireTestPass": true }',
  },
  {
    ...candidate,
    id: 'OC-1017',
    title: 'Owner field reset on bulk update',
    users: 2,
    sessions: 3,
    firstSeen: ago(72),
    state: 'CONFIRMED',
    appliedAt: ago(3),
    confirmedAt: ago(2.7),
    confirmation: {
      status: 'CONFIRMED',
      detail: 'Confirmed by the next matching task, 18m after apply',
    },
  },
  {
    ...candidate,
    id: 'OC-1008',
    title: 'Stage change skips the required note',
    users: 1,
    sessions: 2,
    firstSeen: ago(96),
    state: 'PARKED',
    stateReason: 'assertion: SCHEMA_INVALID',
    change: undefined,
    after: undefined,
    scope: undefined,
  },
]

export const demoIncidents = (): IncidentDetailView[] => structuredClone(variants)
export const demoIncident = (id: string): IncidentDetailView | undefined =>
  demoIncidents().find((incident) => incident.id === id)
export const demoIncidentSummaries = (): IncidentSummaryView[] =>
  demoIncidents().map(({ id, title, users, firstSeen, state }) => ({
    id,
    title,
    users,
    firstSeen,
    state,
  }))
