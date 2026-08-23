import type { AgentConfig } from '@wingman/schema'
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { ConfigResolver } from './resolve'
import { canonicalJSON } from '@wingman/schema'

const base = { systemPrompt: 'base', tools: [], rules: [] } as unknown as AgentConfig
const remote = { systemPrompt: 'base', tools: [], rules: ['reporter'] } as unknown as AgentConfig

const signature = (config: AgentConfig): string =>
  createHmac('sha256', 'signing-key').update(`agent.2.${canonicalJSON(config)}`).digest('hex')

describe('ConfigResolver', () => {
  it('uses the remote signed config and caches it for five seconds', async () => {
    let now = 0
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ config: remote, version: 2, signature: signature(remote) }), { status: 200 }))
    const resolver = new ConfigResolver({ endpoint: 'https://outcome.test', apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher, now: () => now })

    expect(await resolver.resolve('agent', 'hash')).toEqual(remote)
    expect(await resolver.resolve('agent', 'hash')).toEqual(remote)
    now = 5_001
    expect(await resolver.resolve('agent', 'hash')).toEqual(remote)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('falls through to last-known-good and base without retrying', async () => {
    const storage = new Map<string, string>()
    storage.set('outcome:config:agent:hash', JSON.stringify({ config: remote, version: 2, signature: signature(remote) }))
    const fetcher = vi.fn(async () => { throw new Error('offline') })
    const resolver = new ConfigResolver({ endpoint: 'https://outcome.test', apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher, storage })

    expect(await resolver.resolve('agent', 'hash')).toEqual(remote)
    expect(fetcher).toHaveBeenCalledOnce()
    storage.clear()
    resolver.clear()
    expect(await resolver.resolve('agent', 'other')).toEqual(base)
  })

  it('rejects unsigned and mismatched versions', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ config: remote, version: 2, signature: 'bad' }), { status: 200 }))
    const resolver = new ConfigResolver({ endpoint: 'https://outcome.test', apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher })
    expect(await resolver.resolve('agent', 'hash')).toEqual(base)
  })

  it('rejects a signed config over the local hard diff cap', async () => {
    const oversized = { ...remote, rules: ['x'.repeat(5_000)] } as AgentConfig
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ config: oversized, version: 2, signature: signature(oversized) }), { status: 200 }))
    const resolver = new ConfigResolver({ endpoint: 'https://outcome.test', apiKey: 'key', baseConfig: base, signingKey: 'signing-key', maxDiffBytes: 4_096, fetcher })
    expect(await resolver.resolve('agent', 'hash')).toEqual(base)
  })

  it('returns a cached config in under one millisecond at p99', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ config: remote, version: 2, signature: signature(remote) }), { status: 200 }))
    const resolver = new ConfigResolver({ endpoint: 'https://outcome.test', apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher })
    await resolver.resolve('agent', 'hash')
    const durations: number[] = []
    for (let index = 0; index < 5_000; index += 1) {
      const started = performance.now()
      await resolver.resolve('agent', 'hash')
      durations.push(performance.now() - started)
    }
    durations.sort((a, b) => a - b)
    expect(durations[Math.floor(durations.length * 0.99)]).toBeLessThan(1)
  })

  it('negative-caches an outage and returns base below the cold-path budget', async () => {
    let now = 0
    const fetcher = vi.fn(async () => new Response('', { status: 503 }))
    const resolver = new ConfigResolver({ endpoint: 'https://outcome.test', apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher, now: () => now })
    const durations: number[] = []
    for (let index = 0; index < 100; index += 1) {
      const started = performance.now()
      expect(await resolver.resolve('agent', 'hash')).toEqual(base)
      durations.push(performance.now() - started)
    }
    durations.sort((a, b) => a - b)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(durations[Math.floor(durations.length * 0.99)]).toBeLessThan(50)
    now = 5_001
    await resolver.resolve('agent', 'hash')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
