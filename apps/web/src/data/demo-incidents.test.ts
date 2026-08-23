import { describe, expect, it } from 'vitest'

import { demoIncidents } from './demo-incidents'

describe('demoIncidents', () => {
  it('provides the six sorted, realistic inbox receipts without shared mutation', () => {
    const first = demoIncidents()
    expect(first).toHaveLength(6)
    expect(first.map((incident) => incident.users)).toEqual([12, 7, 4, 3, 2, 1])
    const lead = first[0]
    if (!lead) throw new Error('Missing lead demo incident')
    lead.users = 99
    expect(demoIncidents()[0]?.users).toBe(12)
  })
})
