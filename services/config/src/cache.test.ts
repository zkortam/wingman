import { describe, expect, it, vi } from 'vitest'

import { ResolutionCache } from './cache'

describe('ResolutionCache', () => {
  it('caches successful and fallback values for exactly one TTL', async () => {
    let now = 0
    const cache = new ResolutionCache<string>({ ttlMs: 5_000, now: () => now })
    const resolve = vi.fn(async () => 'v1')

    expect(await cache.resolve('agent:user', resolve)).toBe('v1')
    expect(await cache.resolve('agent:user', resolve)).toBe('v1')
    now = 5_001
    expect(await cache.resolve('agent:user', resolve)).toBe('v1')
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent resolution', async () => {
    const cache = new ResolutionCache<string>({ ttlMs: 5_000 })
    const resolve = vi.fn(async () => 'v1')
    await Promise.all([cache.resolve('same', resolve), cache.resolve('same', resolve)])
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('invalidates only the targeted agent', async () => {
    const cache = new ResolutionCache<string>({ ttlMs: 5_000 })
    await cache.resolve('a:u', async () => 'a')
    await cache.resolve('b:u', async () => 'b')
    cache.invalidateAgent('a')
    expect(cache.has('a:u')).toBe(false)
    expect(cache.has('b:u')).toBe(true)
  })
})
