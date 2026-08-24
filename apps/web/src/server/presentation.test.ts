import type { IncidentDetail, IncidentSummary } from '@wingman/schema'
import { describe, expect, it } from 'vitest'

import { presentIncident, presentIncidentSummary } from './presentation'

const summary: IncidentSummary = {
  id: 'd83324af-15dc-49df-bb1a-61ee7a43ced1',
  title: 'Export ignores filters',
  affectedUsers: 2,
  sessionCount: 3,
  firstSeen: '2026-08-01T00:00:00.000Z',
  lastSeen: '2026-08-02T00:00:00.000Z',
  state: 'CANDIDATE',
  stateReason: null,
  verdict: 'CONFIG_DEFECT',
}

describe('pipeline presentation adapter', () => {
  it('maps the frozen reader summary without leaking service field names', () => {
    expect(presentIncidentSummary(summary)).toEqual({
      id: summary.id,
      title: summary.title,
      users: 2,
      firstSeen: summary.firstSeen,
      state: 'CANDIDATE',
    })
  })

  it('builds an operator proof from a pipeline detail', () => {
    const detail: IncidentDetail = {
      ...summary,
      attempt: 1,
      evidence: [{
        sessionId: '75618c04-8c63-4b4f-bc67-0260150ae15b',
        turnIdx: 2,
        kind: 'RETRY_REQUEST',
        confidence: 0.81,
        baseline: 0.12,
        turns: [
          { role: 'user', textRedacted: 'Export these records.' },
          { role: 'tool', textRedacted: null },
          { role: 'assistant', textRedacted: 'Exported all records.' },
        ],
      }],
      verdictConfidence: 0.86,
      verdictEvidence: { reasons: ['Filters were omitted.'] },
      assertion: null,
      before: null,
      candidate: null,
      after: null,
      positiveSuite: [],
      outcome: null,
      handoff: null,
    }
    expect(presentIncident(detail)).toMatchObject({
      users: 2,
      sessions: 3,
      verdict: { kind: 'CONFIG_DEFECT', confidence: 0.86, evidence: ['Filters were omitted.'] },
      evidence: [{
        signal: 'RETRY_REQUEST',
        turns: [
          { role: 'user', text: 'Export these records.' },
          { role: 'assistant', text: 'Exported all records.' },
        ],
      }],
    })
  })
})
