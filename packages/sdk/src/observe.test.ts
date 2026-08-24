import { describe, expect, it, vi } from 'vitest'

import { ObservationQueue } from './observe'

describe('ObservationQueue', () => {
  it('returns synchronously, drops the oldest item, and never throws into host code', async () => {
    const sent: unknown[] = []
    const queue = new ObservationQueue({
      capacity: 2,
      send: async (item) => {
        sent.push(item)
      },
    })
    const started = performance.now()
    queue.push({ id: 1 })
    queue.push({ id: 2 })
    queue.push({ id: 3 })
    expect(performance.now() - started).toBeLessThan(1)

    await queue.flush()
    expect(sent).toEqual([{ id: 2 }, { id: 3 }])
  })

  it('contains transport failure and keeps flush bounded', async () => {
    const queue = new ObservationQueue({
      capacity: 2,
      send: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    queue.push({ id: 1 })
    await expect(queue.flush()).resolves.toBeUndefined()
  })

  it('keeps p99 host overhead below one millisecond', () => {
    const queue = new ObservationQueue({ capacity: 100, send: async () => undefined })
    const durations = Array.from({ length: 2_000 }, (_, index) => {
      const started = performance.now()
      queue.push({ index })
      return performance.now() - started
    }).sort((a, b) => a - b)
    expect(durations[Math.floor(durations.length * 0.99)]).toBeLessThan(1)
  })

  it('drains observations added during an active flush', async () => {
    const sent: unknown[] = []
    let release: (() => void) | undefined
    const queue = new ObservationQueue({
      capacity: 3,
      send: async (item) => {
        if (sent.length === 0)
          await new Promise<void>((resolve) => {
            release = resolve
          })
        sent.push(item)
      },
    })
    queue.push({ id: 1 })
    const flushing = queue.flush()
    queue.push({ id: 2 })
    release?.()
    await flushing
    expect(sent).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('limits transport concurrency and reports drops and failures', async () => {
    let active = 0
    let maximum = 0
    const queue = new ObservationQueue({
      capacity: 3,
      concurrency: 2,
      send: async (item) => {
        active += 1
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active -= 1
        if ((item as { id: number }).id === 3) throw new Error('rejected')
      },
    })
    queue.push({ id: 1 })
    queue.push({ id: 2 })
    queue.push({ id: 3 })
    queue.push({ id: 4 })
    await queue.flush()

    expect(maximum).toBe(2)
    expect(queue.stats()).toEqual({ queued: 0, dropped: 1, sent: 2, failed: 1, retrying: 0 })
  })
})
