import { sessionUuid } from '@wingman/schema'
import { describe, expect, it, vi } from 'vitest'

import { Wingman, type InitOptions } from './index.js'

const AGENT = '4ee0d899-d63d-4bc2-b47a-25aa25c6078b'
const ORG = '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26'

const options = (overrides: Partial<InitOptions> = {}): InitOptions => ({
  endpoint: 'https://wingman.test',
  apiKey: 'key',
  orgId: ORG,
  orgSalt: 'salt',
  signingKey: 'signing-key',
  baseConfig: {
    systemPrompt: 'Help.',
    tools: { export_records: { description: 'Export.' } },
    retrieval: {},
    rules: [],
  },
  defaultAgent: AGENT,
  writable: ['rules'],
  redact: { fields: ['turns'] },
  storage: { get: () => undefined, set: () => undefined },
  ...overrides,
})

/** Sessions are stored under a `uuid` column, but agent frameworks routinely issue nanoid, cuid, or. */
describe('a host session identifier does not have to be a UUID', () => {
  it.each([
    ['a nanoid', 'V1StGXR8_Z5jdHi6B-myT'],
    ['a cuid2', 'tz4a98xxat96iws9zmbrgj3a'],
    ['a ULID', '01ARZ3NDEKTSV4RRFFQ69G5FAV'],
    ['an opaque host id', 'conversation/2026-08-24/17'],
  ])('reviews a tool call for a session identified by %s', async (_name, sessionId) => {
    const reviewer = vi.fn(async () => ({
      action: 'ALLOW' as const,
      reason: 'ok',
      instruction: null,
      confidence: 1,
    }))
    const client = Wingman.init(options({ review: { reviewer } }))

    const decision = await client.reviewToolCall({
      sessionId,
      userId: 'user-1',
      userMessage: 'Export.',
      proposedCall: { name: 'export_records', args: {} },
      recentTurns: [],
      context: {},
    })

    // LOCAL means the reviewer actually ran. FAIL_OPEN would mean it did not.
    expect(decision).toMatchObject({ action: 'ALLOW', source: 'LOCAL' })
    expect(reviewer).toHaveBeenCalledOnce()
  })

  it('sends the same session id for review and for observation', async () => {
    const seen: string[] = []
    const reviewer = vi.fn(async (request: { sessionId: string }) => {
      seen.push(request.sessionId)
      return { action: 'ALLOW' as const, reason: 'ok', instruction: null, confidence: 1 }
    })
    const client = Wingman.init(
      options({
        review: { reviewer },
        fetcher: async (_input, init) => {
          seen.push((JSON.parse(String(init?.body)) as { id: string }).id)
          return new Response('', { status: 202 })
        },
      }),
    )
    const sessionId = 'V1StGXR8_Z5jdHi6B-myT'

    await client.reviewToolCall({
      sessionId,
      userId: 'user-1',
      userMessage: 'Export.',
      proposedCall: { name: 'export_records', args: {} },
      recentTurns: [],
      context: {},
    })
    client.observeSession({
      id: sessionId,
      userId: 'user-1',
      startedAt: '2026-08-23T20:00:00.000Z',
      turns: [
        {
          idx: 0,
          role: 'user',
          text: 'Export.',
          toolCalls: [],
          createdAt: '2026-08-23T20:00:00.000Z',
        },
      ],
    })
    await client.flush()

    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])
  })

  it('leaves an identifier that is already a UUID untouched', () => {
    const uuid = 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6'
    expect(sessionUuid(uuid)).toBe(uuid)
  })

  it('derives the same UUID every time for one host identifier', () => {
    expect(sessionUuid('session-a')).toBe(sessionUuid('session-a'))
    expect(sessionUuid('session-a')).not.toBe(sessionUuid('session-b'))
  })

  it('derives a value the wire contract accepts', () => {
    expect(sessionUuid('session-a')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
