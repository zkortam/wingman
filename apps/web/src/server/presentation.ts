import type { AssertionDefinition, IncidentDetail, IncidentSummary, JsonValue } from '@wingman/schema'

import type { IncidentDetailView, IncidentSummaryView, SignalKind } from '../domain/incidents'

const SIGNALS = new Set<SignalKind>(['RETRY_REQUEST', 'RESTATED_CONSTRAINT', 'ABANDON_RESTART'])

export const presentIncidentSummary = (incident: IncidentSummary): IncidentSummaryView => ({
  id: incident.id,
  title: incident.title,
  users: incident.affectedUsers,
  firstSeen: incident.firstSeen,
  state: incident.state,
})

export const presentIncident = (incident: IncidentDetail): IncidentDetailView => {
  const summary = presentIncidentSummary(incident)
  const view: IncidentDetailView = {
    ...summary,
    sessions: incident.sessionCount,
    evidence: incident.evidence.flatMap((item) => {
      if (!SIGNALS.has(item.kind as SignalKind)) return []
      return [{
        id: item.sessionId,
        signal: item.kind as SignalKind,
        confidence: item.confidence,
        baseline: item.baseline ?? 0,
        turns: item.turns.flatMap((turn) => {
          if ((turn.role !== 'user' && turn.role !== 'assistant') || turn.textRedacted === null) return []
          return [{ role: turn.role, text: turn.textRedacted, signaled: turn.role === 'user' && item.turnIdx > 0 }]
        }),
      }]
    }),
  }
  if (incident.stateReason !== null) view.stateReason = incident.stateReason
  if (incident.verdict !== null && incident.verdictConfidence !== null) {
    view.verdict = {
      kind: incident.verdict,
      confidence: incident.verdictConfidence,
      evidence: collectStrings(incident.verdictEvidence),
    }
  }
  if (incident.assertion !== null) {
    view.assertion = {
      kind: incident.assertion.definition.kind,
      expression: assertionExpression(incident.assertion.definition),
      params: structuredClone(incident.assertion.definition),
    }
  }
  if (incident.before !== null) view.before = { n: incident.before.n, passCount: incident.before.passCount }
  if (incident.candidate !== null) {
    view.change = {
      path: incident.candidate.diff.changes.map(({ path }) => path).join(', '),
      bytes: incident.candidate.diffBytes,
      lines: incident.candidate.diff.changes.flatMap((change) => [
        { kind: 'remove' as const, text: `${change.path}: ${JSON.stringify(change.before)}` },
        { kind: 'add' as const, text: `${change.path}: ${JSON.stringify(change.after)}` },
      ]),
    }
  }
  if (incident.after !== null) {
    view.after = {
      n: incident.after.n,
      passCount: incident.after.passCount,
      positiveSuitePassed: incident.positiveSuite.reduce((total, run) => total + run.passCount, 0),
      positiveSuiteTotal: incident.positiveSuite.reduce((total, run) => total + run.n, 0),
    }
  }
  if (incident.outcome !== null) {
    view.scope = incident.outcome.scope
    view.appliedAt = incident.outcome.createdAt
    if (incident.outcome.confirmedAt !== null) view.confirmedAt = incident.outcome.confirmedAt
    view.confirmation = {
      status: incident.outcome.status === 'REVERTED' ? 'REFUTED' : incident.outcome.status,
      detail: confirmationDetail(incident.outcome.status, incident.outcome.windowEndsAt),
    }
  }
  if (incident.handoff !== null) view.handoff = JSON.stringify(incident.handoff, null, 2)
  return view
}

const assertionExpression = (assertion: AssertionDefinition): string => {
  if (assertion.kind === 'TOOL_CALLED') return `${assertion.tool} called`
  if (assertion.kind === 'TOOL_ARG_EQUALS') return `${assertion.tool}.${assertion.arg} == ${JSON.stringify(assertion.expected)}`
  return `output matches ${assertion.rule}`
}

const collectStrings = (value: Record<string, JsonValue> | null): string[] => {
  if (value === null) return []
  const strings: string[] = []
  const visit = (item: JsonValue): void => {
    if (typeof item === 'string') strings.push(item)
    else if (Array.isArray(item)) item.forEach(visit)
    else if (item !== null && typeof item === 'object') Object.values(item).forEach(visit)
  }
  visit(value)
  return strings
}

const confirmationDetail = (status: string, windowEndsAt: string): string => {
  if (status === 'PENDING') return `Confirmation window ends ${new Date(windowEndsAt).toLocaleString()}`
  if (status === 'CONFIRMED') return 'Confirmed by a subsequent matching session'
  if (status === 'UNOBSERVED') return 'No matching session arrived during the confirmation window'
  if (status === 'REVERTED') return 'The configuration override was reverted'
  return 'A subsequent matching session refuted the change'
}
