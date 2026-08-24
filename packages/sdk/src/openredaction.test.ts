import { describe, expect, it } from 'vitest'

import { LocalPiiScrubber } from './openredaction'

describe('LocalPiiScrubber', () => {
  it('redacts locally through OpenRedaction', async () => {
    await expect(new LocalPiiScrubber().scrub('Email jane@example.com')).resolves.toBe('Email [EMAIL]')
  })
})
