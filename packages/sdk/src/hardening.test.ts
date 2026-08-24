import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'

import { canonicalJSON, type AgentConfig } from '@wingman/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DiagnosticEvent } from './diagnostics.js'
import { ObservationQueue } from './observe.js'
import { ConfigResolver } from './resolve.js'
import { FileConfigStorage } from './storage.js'
import { Wingman, type InitOptions } from './index.js'

const AGENT = '4ee0d899-d63d-4bc2-b47a-25aa25c6078b'
const ORG = '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26'
const SESSION = 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6'
const SIGNING_KEY = 'signing-key'

const baseConfig: AgentConfig = {
  systemPrompt: 'Help.',
  tools: { export_records: { description: 'Export.' } },
  retrieval: {},
  rules: [],
}

const sign = (agent: string, version: number, config: AgentConfig): string =>
  createHmac('sha256', SIGNING_KEY)
    .update(`${agent}.${String(version)}.${canonicalJSON(config)}`)
    .digest('hex')

const signed = (version: number, config: AgentConfig) => ({
  version,
  config,
  signature: sign(AGENT, version, config),
})

const memoryStorage = () => {
  const map = new Map<string, string>()
  return {
    map,
    get: (key: string) => map.get(key),
    set: (key: string, value: string) => map.set(key, value),
  }
}

const options = (overrides: Partial<InitOptions> = {}): InitOptions => ({
  endpoint: 'https://wingman.test',
  apiKey: 'key',
  orgId: ORG,
  orgSalt: 'salt',
  signingKey: SIGNING_KEY,
  baseConfig,
  defaultAgent: AGENT,
  writable: ['rules'],
  redact: { fields: ['turns'] },
  storage: memoryStorage(),
  ...overrides,
})

const temporaryDirectories: string[] = []
afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true })
  }
})

describe('the endpoint contract is validated at construction', () => {
  it.each([
    ['a query string', 'https://wingman.test?tenant=acme'],
    ['a fragment', 'https://wingman.test#stage'],
  ])('rejects an endpoint carrying %s', (_name, endpoint) => {
    // Both fail-open paths would otherwise hide the misconfiguration behind base config and blanket.
    expect(() => Wingman.init(options({ endpoint }))).toThrow(/query string|fragment/)
  })

  it('rejects an unparseable endpoint with the offending value', () => {
    expect(() => Wingman.init(options({ endpoint: 'not a url' }))).toThrow(/not a valid URL/)
  })

  it('still accepts a base path and joins request paths onto it', async () => {
    const seen: string[] = []
    const client = Wingman.init(
      options({
        endpoint: 'https://wingman.test/api',
        fetcher: async (input) => {
          seen.push(String(input))
          return new Response('', { status: 503 })
        },
      }),
    )
    await client.config({ agent: AGENT, userId: 'user-1' })
    expect(seen[0]).toContain('https://wingman.test/api/v1/config/')
  })
})

describe('the writable allowlist cannot be widened after construction', () => {
  it('ignores a later push into the caller’s array', async () => {
    const writable = ['rules']
    const storage = memoryStorage()
    const widened: AgentConfig = { ...baseConfig, systemPrompt: 'Rewritten by the control plane.' }
    const client = Wingman.init(
      options({
        writable,
        storage,
        fetcher: async () => Response.json(signed(2, widened)),
      }),
    )
    writable.push('systemPrompt')
    const resolved = await client.config({ agent: AGENT, userId: 'user-1' })
    expect(resolved.systemPrompt).toBe('Help.')
  })
})

describe('signed configuration must be current, not merely authentic', () => {
  it('refuses a validly signed version older than one already accepted', async () => {
    const storage = memoryStorage()
    const withRule: AgentConfig = {
      ...baseConfig,
      rules: ['Always confirm before exporting.'],
    }
    let payload = signed(4, withRule)
    let outage = false
    const resolver = new ConfigResolver({
      endpoint: 'https://wingman.test',
      apiKey: 'key',
      baseConfig,
      signingKey: SIGNING_KEY,
      writablePaths: ['rules'],
      storage,
      cacheTtlMs: 0,
      fetcher: async () => (outage ? new Response('', { status: 503 }) : Response.json(payload)),
    })
    expect((await resolver.resolve(AGENT, 'a'.repeat(32))).rules).toHaveLength(1)

    // The operator revokes the rule by publishing v5.
    payload = signed(5, baseConfig)
    expect((await resolver.resolve(AGENT, 'a'.repeat(32))).rules).toHaveLength(0)

    // A stale v4 left on disk must not reinstate the revoked rule during an outage.
    storage.map.set(
      `wingman:config:${AGENT}:${'a'.repeat(32)}`,
      JSON.stringify(signed(4, withRule)),
    )
    outage = true
    expect((await resolver.resolve(AGENT, 'a'.repeat(32))).rules).toHaveLength(0)
  })

  it('accepts a deliberate operator rollback to an earlier version', async () => {
    const storage = memoryStorage()
    const withRule: AgentConfig = { ...baseConfig, rules: ['Always confirm before exporting.'] }
    let payload = signed(7, withRule)
    const resolver = new ConfigResolver({
      endpoint: 'https://wingman.test',
      apiKey: 'key',
      baseConfig,
      signingKey: SIGNING_KEY,
      writablePaths: ['rules'],
      storage,
      cacheTtlMs: 0,
      fetcher: async () => Response.json(payload),
    })
    expect((await resolver.resolve(AGENT, 'a'.repeat(32))).rules).toHaveLength(1)

    // Revert re-serves the base version, which is numerically lower.
    payload = signed(1, baseConfig)
    expect((await resolver.resolve(AGENT, 'a'.repeat(32))).rules).toHaveLength(0)
  })

  it('reports why a configuration was rejected', async () => {
    const events: DiagnosticEvent[] = []
    const resolver = new ConfigResolver({
      endpoint: 'https://wingman.test',
      apiKey: 'key',
      baseConfig,
      signingKey: SIGNING_KEY,
      storage: memoryStorage(),
      onDiagnostic: (event) => events.push(event),
      fetcher: async () =>
        Response.json({ version: 2, config: baseConfig, signature: 'f'.repeat(64) }),
    })
    await resolver.resolve(AGENT, 'a'.repeat(32))
    expect(events.map(({ code }) => code)).toContain('CONFIG_REJECTED')
    expect(events.find(({ code }) => code === 'CONFIG_REJECTED')?.message).toMatch(/signature/)
  })
})

describe('a configuration outage recovers promptly', () => {
  it('does not pin the fallback for a full success window', async () => {
    let healthy = false
    let now = 0
    const resolver = new ConfigResolver({
      endpoint: 'https://wingman.test',
      apiKey: 'key',
      baseConfig,
      signingKey: SIGNING_KEY,
      writablePaths: ['rules'],
      storage: memoryStorage(),
      now: () => now,
      fetcher: async () =>
        healthy
          ? Response.json(
              signed(2, {
                ...baseConfig,
                rules: ['Confirm first.'],
              }),
            )
          : new Response('', { status: 503 }),
    })
    expect((await resolver.resolve(AGENT, 'a'.repeat(32))).rules).toHaveLength(0)
    healthy = true
    now += 1_001
    expect((await resolver.resolve(AGENT, 'a'.repeat(32))).rules).toHaveLength(1)
  })

  it('reports which source served the configuration', async () => {
    const client = Wingman.init(options({ fetcher: async () => new Response('', { status: 503 }) }))
    await client.config({ agent: AGENT, userId: 'user-1' })
    expect(client.configSource({ agent: AGENT, userId: 'user-1' })).toBe('base')
  })
})

describe('the resolver cache is bounded and invalidatable', () => {
  it('evicts the least recently used identity instead of growing forever', async () => {
    const resolver = new ConfigResolver({
      endpoint: 'https://wingman.test',
      apiKey: 'key',
      baseConfig,
      signingKey: SIGNING_KEY,
      storage: memoryStorage(),
      maxCacheEntries: 2,
      fetcher: async () => Response.json(signed(1, baseConfig)),
    })
    for (const suffix of ['1', '2', '3']) {
      await resolver.resolve(AGENT, suffix.repeat(32))
    }
    expect(resolver.sourceOf(AGENT, '1'.repeat(32))).toBeUndefined()
    expect(resolver.sourceOf(AGENT, '3'.repeat(32))).toBe('remote')
  })

  it('lets a host drop cached configuration without a restart', async () => {
    let calls = 0
    const client = Wingman.init(
      options({
        fetcher: async () => {
          calls += 1
          return Response.json(signed(1, baseConfig))
        },
      }),
    )
    await client.config({ agent: AGENT, userId: 'user-1' })
    await client.config({ agent: AGENT, userId: 'user-1' })
    expect(calls).toBe(1)
    client.invalidateConfig({ agent: AGENT, userId: 'user-1' })
    await client.config({ agent: AGENT, userId: 'user-1' })
    expect(calls).toBe(2)
  })
})

describe('observed sessions are captured, not referenced', () => {
  it('sends the session as it was at observe time', async () => {
    const bodies: unknown[] = []
    const client = Wingman.init(
      options({
        fetcher: async (_input, init) => {
          bodies.push(JSON.parse(String(init?.body)))
          return new Response('', { status: 202 })
        },
      }),
    )
    const session = {
      id: SESSION,
      userId: 'user-1',
      startedAt: '2026-08-23T20:00:00.000Z',
      turns: [
        {
          idx: 0,
          role: 'user' as const,
          text: 'Export the filtered view.',
          toolCalls: [],
          createdAt: '2026-08-23T20:00:00.000Z',
        },
      ],
    }
    client.observeSession(session)
    // A host appending to one long-lived session object must not retroactively change the evidence it.
    session.turns.push({
      idx: 1,
      role: 'user' as const,
      text: 'A later turn from a different request.',
      toolCalls: [],
      createdAt: '2026-08-23T20:05:00.000Z',
    })
    await client.flush()
    expect((bodies[0] as { turns: unknown[] }).turns).toHaveLength(1)
  })
})

describe('evidence delivery retries and reports', () => {
  it('retries a transient failure and reports a permanent drop', async () => {
    const events: DiagnosticEvent[] = []
    let attempts = 0
    const queue = new ObservationQueue({
      capacity: 4,
      maxAttempts: 3,
      delay: async () => undefined,
      onDiagnostic: (event) => events.push(event),
      send: async () => {
        attempts += 1
        if (attempts < 3) throw new Error('offline')
      },
    })
    queue.push({ id: 1 })
    await queue.flush()
    expect(attempts).toBe(3)
    expect(queue.stats()).toMatchObject({ sent: 1, failed: 0 })
    expect(events).toHaveLength(0)
  })

  it('gives up and reports after the attempt budget', async () => {
    const events: DiagnosticEvent[] = []
    const queue = new ObservationQueue({
      capacity: 4,
      maxAttempts: 2,
      delay: async () => undefined,
      onDiagnostic: (event) => events.push(event),
      send: async () => {
        throw new Error('offline')
      },
    })
    queue.push({ id: 1 })
    await queue.flush()
    expect(queue.stats()).toMatchObject({ failed: 1, queued: 0 })
    expect(events.map(({ code }) => code)).toContain('EVIDENCE_DROPPED')
  })

  it('reports a dropped session when the queue overflows', () => {
    const events: DiagnosticEvent[] = []
    const queue = new ObservationQueue({
      capacity: 1,
      onDiagnostic: (event) => events.push(event),
      send: async () => undefined,
    })
    queue.push({ id: 1 })
    queue.push({ id: 2 })
    expect(events.map(({ code }) => code)).toEqual(['EVIDENCE_DROPPED'])
  })
})

describe('review reports rather than silently degrading', () => {
  it('names an authentication failure instead of looking like an approval', async () => {
    const events: DiagnosticEvent[] = []
    const client = Wingman.init(
      options({
        onDiagnostic: (event) => events.push(event),
        fetcher: async () => new Response('', { status: 401 }),
      }),
    )
    const decision = await client.reviewToolCall({
      sessionId: SESSION,
      userId: 'user-1',
      userMessage: 'Export.',
      proposedCall: { name: 'export_records', args: {} },
      recentTurns: [],
      context: {},
    })
    expect(decision.source).toBe('FAIL_OPEN')
    const unauthorized = events.find(({ code }) => code === 'UNAUTHORIZED')
    expect(unauthorized?.message).toMatch(/not reviewing/i)
  })

  it('truncates an oversized turn window instead of refusing to review', async () => {
    const events: DiagnosticEvent[] = []
    const reviewer = vi.fn(async (request) => {
      expect(request.recentTurns).toHaveLength(20)
      return { action: 'ALLOW' as const, reason: 'ok', instruction: null, confidence: 1 }
    })
    const client = Wingman.init(
      options({ onDiagnostic: (e) => events.push(e), review: { reviewer } }),
    )
    const decision = await client.reviewToolCall({
      sessionId: SESSION,
      userId: 'user-1',
      userMessage: 'Export.',
      proposedCall: { name: 'export_records', args: {} },
      recentTurns: Array.from({ length: 25 }, (_, idx) => ({
        idx,
        role: 'user' as const,
        textRedacted: `turn ${String(idx)}`,
        toolCalls: [],
        createdAt: '2026-08-23T20:00:00.000Z',
      })),
      context: {},
    })
    expect(decision).toMatchObject({ action: 'ALLOW', source: 'LOCAL' })
    expect(events.some(({ message }) => /truncated/i.test(message))).toBe(true)
  })

  it('drops an unsupported context key instead of refusing to review', async () => {
    const events: DiagnosticEvent[] = []
    const reviewer = vi.fn(async (request) => {
      expect(request.context).toEqual({ lastQuery: 'stage:New' })
      return { action: 'ALLOW' as const, reason: 'ok', instruction: null, confidence: 1 }
    })
    const client = Wingman.init(
      options({ onDiagnostic: (e) => events.push(e), review: { reviewer } }),
    )
    const decision = await client.reviewToolCall({
      sessionId: SESSION,
      userId: 'user-1',
      userMessage: 'Export.',
      proposedCall: { name: 'export_records', args: {} },
      recentTurns: [],
      context: { lastQuery: 'stage:New', tenantId: 'acme' } as never,
    })
    expect(decision).toMatchObject({ action: 'ALLOW' })
    expect(events.some(({ message }) => /tenantId/.test(message))).toBe(true)
  })

  it('accepts a timestamp carrying a UTC offset', async () => {
    const reviewer = vi.fn(async () => ({
      action: 'ALLOW' as const,
      reason: 'ok',
      instruction: null,
      confidence: 1,
    }))
    const client = Wingman.init(options({ review: { reviewer } }))
    await expect(
      client.reviewToolCall({
        sessionId: SESSION,
        userId: 'user-1',
        userMessage: 'Export.',
        proposedCall: { name: 'export_records', args: {} },
        recentTurns: [
          {
            idx: 0,
            role: 'user',
            textRedacted: 'Export.',
            toolCalls: [],
            createdAt: '2026-08-23T22:00:00+02:00',
          },
        ],
        context: {},
      }),
    ).resolves.toMatchObject({ action: 'ALLOW', source: 'LOCAL' })
    expect(reviewer).toHaveBeenCalled()
  })

  it('reviews an agent-initiated call that has no new user message', async () => {
    const reviewer = vi.fn(async () => ({
      action: 'ALLOW' as const,
      reason: 'ok',
      instruction: null,
      confidence: 1,
    }))
    const client = Wingman.init(options({ review: { reviewer } }))
    await expect(
      client.reviewToolCall({
        sessionId: SESSION,
        userId: 'user-1',
        userMessage: '',
        proposedCall: { name: 'export_records', args: {} },
        recentTurns: [],
        context: {},
      }),
    ).resolves.toMatchObject({ source: 'LOCAL' })
  })
})

describe('FileConfigStorage keeps the local cache private and bounded', () => {
  const directory = (): string => {
    const path = mkdtempSync(join(tmpdir(), 'wingman-storage-'))
    temporaryDirectories.push(path)
    return path
  }

  it('round-trips a value', () => {
    const storage = new FileConfigStorage(join(directory(), 'cache'))
    storage.set('wingman:config:a:b', 'value')
    expect(storage.get('wingman:config:a:b')).toBe('value')
  })

  it('ignores and removes an entry past its maximum age', () => {
    const path = join(directory(), 'cache')
    const storage = new FileConfigStorage(path, { maxAgeMs: 1_000 })
    storage.set('wingman:config:a:b', 'value')
    const [file] = readdirSync(path)
    const stale = Date.now() / 1_000 - 60
    utimesSync(join(path, String(file)), stale, stale)
    expect(storage.get('wingman:config:a:b')).toBeUndefined()
    expect(readdirSync(path)).toHaveLength(0)
  })

  it('evicts the oldest entries beyond the cap', () => {
    const path = join(directory(), 'cache')
    const storage = new FileConfigStorage(path, { maxEntries: 3 })
    for (let index = 0; index < 6; index += 1) storage.set(`key-${String(index)}`, 'value')
    expect(readdirSync(path).filter((name) => name.endsWith('.json')).length).toBeLessThanOrEqual(3)
  })

  it('supports removing a single entry', () => {
    const storage = new FileConfigStorage(join(directory(), 'cache'))
    storage.set('key', 'value')
    storage.delete('key')
    expect(storage.get('key')).toBeUndefined()
  })

  it('refuses a cache path that is not a directory', () => {
    const path = join(directory(), 'not-a-directory')
    writeFileSync(path, 'occupied')
    const storage = new FileConfigStorage(path)
    expect(() => storage.set('key', 'value')).toThrow()
  })
})
