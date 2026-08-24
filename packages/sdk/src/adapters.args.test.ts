import { describe, expect, it, vi } from 'vitest'

import { createToolMiddleware, toArgs } from './adapters.js'

const base = {
  sessionId: 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6',
  userId: 'user-1',
  userMessage: 'Export.',
  recentTurns: [],
  context: {},
}

const allow = {
  action: 'ALLOW' as const,
  reason: 'Normalized.',
  instruction: null,
  confidence: 1,
  source: 'LOCAL' as const,
}

/** The reviewer must see the same call the host is about to execute. */
describe('tool argument normalization preserves what the host will execute', () => {
  it('keeps arguments when an optional field is undefined', () => {
    const result = toArgs({ filters: { stage: 'New' }, cursor: undefined })
    expect(result).toEqual({ ok: true, args: { filters: { stage: 'New' } } })
  })

  it('keeps arguments when a nested optional field is undefined', () => {
    const result = toArgs({ filters: { stage: 'New', owner: undefined }, limit: 25 })
    expect(result).toEqual({ ok: true, args: { filters: { stage: 'New' }, limit: 25 } })
  })

  it('passes the real arguments to the reviewer rather than an empty object', async () => {
    const seen: unknown[] = []
    const reviewer = vi.fn(async (request: { proposedCall: { args: unknown } }) => {
      seen.push(request.proposedCall.args)
      return allow
    })
    const middleware = createToolMiddleware({ reviewToolCall: reviewer })
    await middleware.beforeVercelTool({
      ...base,
      toolName: 'export_records',
      args: { filters: { stage: 'Negotiation' }, cursor: undefined },
    })
    expect(seen).toEqual([{ filters: { stage: 'Negotiation' } }])
  })

  it('represents a Date as an ISO string', () => {
    const result = toArgs({ since: new Date('2026-09-01T10:00:00.000Z') })
    expect(result).toEqual({ ok: true, args: { since: '2026-09-01T10:00:00.000Z' } })
  })

  it('maps undefined inside an array to null, matching JSON serialization', () => {
    expect(toArgs({ ids: ['a', undefined, 'b'] })).toEqual({
      ok: true,
      args: { ids: ['a', null, 'b'] },
    })
  })
})

describe('tool argument normalization refuses to guess', () => {
  it.each([
    ['a Map', { filters: new Map([['stage', 'New']]) }],
    ['a Set', { ids: new Set(['a']) }],
    [
      'a class instance',
      {
        at: new (class Marker {
          readonly kind = 'marker'
        })(),
      },
    ],
    ['a function', { onDone: () => undefined }],
    ['a bigint', { total: 10n }],
    ['a non-finite number', { ratio: Number.POSITIVE_INFINITY }],
    ['an invalid Date', { since: new Date('nope') }],
  ])('reports %s as unrepresentable instead of emptying the arguments', (_name, args) => {
    const result = toArgs(args)
    expect(result.ok).toBe(false)
  })

  it('escalates rather than reviewing a call it cannot represent', async () => {
    const reviewer = vi.fn()
    const middleware = createToolMiddleware({ reviewToolCall: reviewer })
    const decision = await middleware.beforeLangChainTool({
      ...base,
      toolName: 'export_records',
      toolInput: { filters: new Map() },
    })
    expect(decision).toMatchObject({ action: 'ESCALATE', source: 'POLICY' })
    expect(decision.reason).toContain('export_records')
    expect(reviewer).not.toHaveBeenCalled()
  })

  it('rejects a cyclic structure by depth rather than hanging', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(toArgs(cyclic).ok).toBe(false)
  })
})

describe('tool argument normalization handles framework string payloads', () => {
  it('parses a JSON object string', () => {
    expect(toArgs('{"filters":{"stage":"New"}}')).toEqual({
      ok: true,
      args: { filters: { stage: 'New' } },
    })
  })

  it('keeps a non-JSON string as an opaque value', () => {
    expect(toArgs('not-json')).toEqual({ ok: true, args: { value: 'not-json' } })
  })

  it('keeps a JSON array string as an opaque value rather than losing it', () => {
    expect(toArgs('[1,2]')).toEqual({ ok: true, args: { value: '[1,2]' } })
  })

  it('treats a missing payload as no arguments', () => {
    expect(toArgs(undefined)).toEqual({ ok: true, args: {} })
    expect(toArgs(null)).toEqual({ ok: true, args: {} })
  })
})
