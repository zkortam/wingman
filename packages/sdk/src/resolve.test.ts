import type { AgentConfig } from '@wingman/schema'
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { ConfigResolver } from './resolve'
import { canonicalJSON } from '@wingman/schema'

const base: AgentConfig = { systemPrompt: 'base', tools: {}, retrieval: {}, rules: [] }
const remote: AgentConfig = { ...base, rules: ['reporter'] }
const endpoint = 'https://wingman.test'

const signature = (config: unknown): string =>
  createHmac('sha256', 'signing-key').update(`agent.2.${canonicalJSON(config)}`).digest('hex')

describe('ConfigResolver', () => {
  it('uses the remote signed config and caches it for five seconds', async () => {
    let now = 0
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ config: remote, version: 2, signature: signature(remote) }), { status: 200 }))
    const resolver = new ConfigResolver({ endpoint, apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher, now: () => now })

    expect(await resolver.resolve('agent', 'hash')).toEqual(remote)
    expect(await resolver.resolve('agent', 'hash')).toEqual(remote)
    now = 5_001
    expect(await resolver.resolve('agent', 'hash')).toEqual(remote)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('falls through to last-known-good and base without retrying', async () => {
    const storage = new Map<string, string>()
    storage.set('wingman:config:agent:hash', JSON.stringify({ config: remote, version: 2, signature: signature(remote) }))
    const fetcher = vi.fn(async () => { throw new Error('offline') })
    const resolver = new ConfigResolver({ endpoint, apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher, storage })

    expect(await resolver.resolve('agent', 'hash')).toEqual(remote)
    expect(fetcher).toHaveBeenCalledOnce()
    storage.clear()
    resolver.clear()
    expect(await resolver.resolve('agent', 'other')).toEqual(base)
  })

  it('rejects unsigned and mismatched versions', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ config: remote, version: 2, signature: 'bad' }), { status: 200 }))
    const resolver = new ConfigResolver({ endpoint, apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher })
    expect(await resolver.resolve('agent', 'hash')).toEqual(base)
  })

  it('rejects a signed config over the local hard diff cap', async () => {
    const oversized = { ...remote, rules: ['x'.repeat(5_000)] } as AgentConfig
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ config: oversized, version: 2, signature: signature(oversized) }), { status: 200 }))
    const resolver = new ConfigResolver({ endpoint, apiKey: 'key', baseConfig: base, signingKey: 'signing-key', maxDiffBytes: 4_096, fetcher })
    expect(await resolver.resolve('agent', 'hash')).toEqual(base)
  })

  it('rejects a correctly signed payload that is not an AgentConfig', async () => {
    const malformed = { rules: [] }
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      config: malformed,
      version: 2,
      signature: signature(malformed),
    }), { status: 200 }))
    const resolver = new ConfigResolver({ endpoint, apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher })
    expect(await resolver.resolve('agent', 'hash')).toEqual(base)
  })

  it('coalesces concurrent cold-cache requests for the same identity', async () => {
    let release: (() => void) | undefined
    const fetcher = vi.fn(async () => {
      await new Promise<void>((resolve) => { release = resolve })
      return new Response(JSON.stringify({ config: remote, version: 2, signature: signature(remote) }), { status: 200 })
    })
    const resolver = new ConfigResolver({ endpoint, apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher })
    const requests = Array.from({ length: 20 }, () => resolver.resolve('agent', 'hash'))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    release?.()
    await expect(Promise.all(requests)).resolves.toEqual(Array(20).fill(remote))
  })

  it('uses a valid remote config even when last-known-good storage is unavailable', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ config: remote, version: 2, signature: signature(remote) }), { status: 200 }))
    const storage = {
      get: () => undefined,
      set: () => { throw new Error('read-only filesystem') },
    }
    const resolver = new ConfigResolver({ endpoint, apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher, storage })
    expect(await resolver.resolve('agent', 'hash')).toEqual(remote)
  })

  it('falls back when a custom transport ignores abort signals', async () => {
    const resolver = new ConfigResolver({
      endpoint,
      apiKey: 'key',
      baseConfig: base,
      signingKey: 'signing-key',
      fetcher: async () => new Promise(() => undefined),
    })
    const started = performance.now()
    await expect(resolver.resolve('agent', 'hash')).resolves.toEqual(base)
    expect(performance.now() - started).toBeLessThan(400)
  })

  it('honors an explicit cold-read budget for distant or cold config services', async () => {
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250))
      return new Response(JSON.stringify({ config: remote, version: 2, signature: signature(remote) }), { status: 200 })
    })
    const resolver = new ConfigResolver({
      endpoint,
      apiKey: 'key',
      baseConfig: base,
      signingKey: 'signing-key',
      fetcher,
      timeoutMs: 500,
    })

    await expect(resolver.resolve('agent', 'hash')).resolves.toEqual(remote)
  })

  it('returns a cached config without touching the network', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ config: remote, version: 2, signature: signature(remote) }), { status: 200 }))
    const resolver = new ConfigResolver({ endpoint, apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher })
    await resolver.resolve('agent', 'hash')
    const durations: number[] = []
    for (let index = 0; index < 200; index += 1) {
      const started = performance.now()
      await expect(resolver.resolve('agent', 'hash')).resolves.toEqual(remote)
      durations.push(performance.now() - started)
    }
    expect(fetcher).toHaveBeenCalledTimes(1)
    durations.sort((a, b) => a - b)
    expect(durations[Math.floor(durations.length * 0.99)]).toBeLessThan(10)
  })

  it('negative-caches an outage and returns base below the cold-path budget', async () => {
    let now = 0
    const fetcher = vi.fn(async () => new Response('', { status: 503 }))
    const resolver = new ConfigResolver({ endpoint, apiKey: 'key', baseConfig: base, signingKey: 'signing-key', fetcher, now: () => now })
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
