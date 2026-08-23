import { describe, expect, it } from 'vitest'

import { INCIDENT_STATES, incidentPresentation, type IncidentDetailView } from './incidents'

const detail = (state: IncidentDetailView['state']): IncidentDetailView => ({
  id: 'OC-1',
  title: 'Export ignores filters',
  users: 1,
  sessions: 1,
  firstSeen: '2026-08-23T00:00:00.000Z',
  state,
  evidence: [],
})

describe('incidentPresentation', () => {
  it('defines a stable presentation for every incident state', () => {
    for (const state of INCIDENT_STATES) {
      expect(incidentPresentation(detail(state)).status.length).toBeGreaterThan(0)
    }
  })

  it('only offers apply on a verified candidate', () => {
    for (const state of INCIDENT_STATES) {
      expect(incidentPresentation(detail(state)).actions.includes('apply')).toBe(state === 'CANDIDATE')
    }
  })

  it('renders code defects as a human-review handoff, not a new state', () => {
    const incident = detail('HUMAN_REVIEW')
    incident.verdict = { kind: 'CODE_DEFECT', confidence: 0.92, evidence: [] }

    expect(incidentPresentation(incident).status).toBe('Handed off to Codex')
  })
})
