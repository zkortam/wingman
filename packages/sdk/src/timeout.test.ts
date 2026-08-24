import { describe, expect, it } from 'vitest'

import { withTimeout } from './timeout.js'

describe('withTimeout', () => {
  it('resolves a fast promise and rejects a stalled one', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok')
    const started = performance.now()
    await expect(withTimeout(new Promise(() => undefined), 10, 'Review timed out')).rejects.toThrow(
      'Review timed out',
    )
    expect(performance.now() - started).toBeLessThan(100)
  })
})
