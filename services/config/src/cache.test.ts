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

/** Apply and revert both invalidate the cache. */
describe('invalidation beats a resolution that is already in flight', () => {
  it('does not let a stale in-flight resolution repopulate the cache', async () => {
    const cache = new ResolutionCache<string>({ ttlMs: 60_000 })
    let release: ((value: string) => void) | undefined
    const slow = cache.resolve(
      'agent:user',
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    )

    cache.invalidateAgent('agent')
    release?.('before-the-change')
    await slow

    expect(cache.has('agent:user')).toBe(false)
    await expect(cache.resolve('agent:user', async () => 'after-the-change')).resolves.toBe(
      'after-the-change',
    )
  })

  it('does not join an in-flight resolution issued before the change', async () => {
    const cache = new ResolutionCache<string>({ ttlMs: 60_000 })
    let release: ((value: string) => void) | undefined
    const stale = cache.resolve(
      'agent:user',
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    )

    cache.invalidateAgent('agent')
    const fresh = cache.resolve('agent:user', async () => 'after-the-change')

    release?.('before-the-change')
    await expect(stale).resolves.toBe('before-the-change')
    await expect(fresh).resolves.toBe('after-the-change')
  })

  it('leaves another agent’s cache alone', async () => {
    const cache = new ResolutionCache<string>({ ttlMs: 60_000 })
    await cache.resolve('other:user', async () => 'kept')
    cache.invalidateAgent('agent')
    expect(cache.has('other:user')).toBe(true)
  })

  it('bounds the number of retained entries', async () => {
    const cache = new ResolutionCache<string>({ ttlMs: 60_000, maxEntries: 2 })
    for (const key of ['a:1', 'a:2', 'a:3']) await cache.resolve(key, async () => key)
    expect(cache.has('a:1')).toBe(false)
    expect(cache.has('a:3')).toBe(true)
  })
})
