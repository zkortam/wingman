import { describe, expect, it, vi } from 'vitest'

import { rebaseSessions, resetDemo } from './reset'

describe('resetDemo', () => {
  it('validates the committed offline cohort without network', async () => {
    await expect(resetDemo()).resolves.toEqual({
      sessions: 50,
      affected: 12,
      pipelineVerified: false,
    })
  })

  it('replays every session and verifies the live candidate when an endpoint is supplied', async () => {
    let posted = 0
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/v1/events')) {
        posted += 1
        return new Response(null, { status: 202 })
      }
      return new Response(JSON.stringify([{ id: 'OC-1042', users: 12, state: 'CANDIDATE' }]), {
        status: 200,
      })
    })
    await expect(resetDemo({ baseUrl: 'https://outcome.test', fetcher })).resolves.toMatchObject({
      pipelineVerified: true,
    })
    expect(posted).toBe(50)
  })

  it('rebases committed timestamps to reset time without changing their spacing', () => {
    const sessions = [
      {
        id: 's1',
        agentId: 'agent',
        userId: 'user',
        personaId: 'p1',
        defectId: 'OC-001',
        affected: true,
        startedAt: '2025-01-01T11:00:00.000Z',
        endedAt: '2025-01-01T11:02:00.000Z',
        context: { viewFilters: { stage: 'Negotiation' } },
        turns: [{ role: 'user' as const, text: 'Export', createdAt: '2025-01-01T11:00:00.000Z' }],
      },
    ]
    const rebased = rebaseSessions(sessions, new Date('2026-08-23T12:00:00.000Z'))
    expect(rebased[0]?.startedAt).toBe('2026-08-23T11:00:00.000Z')
    expect(rebased[0]?.endedAt).toBe('2026-08-23T11:02:00.000Z')
  })
})
