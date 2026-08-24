import { describe, expect, it } from 'vitest'

import { scrubValue } from './scrub.js'

describe('scrubValue', () => {
  it('scrubs nested strings and leaves non-strings intact', async () => {
    const scrub = async (text: string) => text.replace('secret', '[REDACTED]')
    await expect(
      scrubValue({ nested: { text: 'keep secret', n: 1 }, list: ['secret', 2] }, scrub),
    ).resolves.toEqual({ nested: { text: 'keep [REDACTED]', n: 1 }, list: ['[REDACTED]', 2] })
  })
})
