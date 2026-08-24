import { describe, expect, it } from 'vitest'

import { generateSessions } from './generate'

describe('generateSessions', () => {
  it('creates a deterministic cohort with exactly twelve affected users', () => {
    const sessions = generateSessions({ defectId: 'OC-001', sessions: 50, hitRate: 0.24 })

    expect(sessions).toHaveLength(50)
    expect(sessions.filter((session) => session.affected)).toHaveLength(12)
    expect(new Set(sessions.map((session) => session.userId))).toHaveLength(50)
  })

  it('uses dates relative to generation time', () => {
    const now = new Date('2026-08-23T12:00:00.000Z')
    const [session] = generateSessions({ defectId: 'OC-001', sessions: 1, hitRate: 1, now })

    expect(session?.startedAt).toBe('2026-08-23T11:00:00.000Z')
  })
})
