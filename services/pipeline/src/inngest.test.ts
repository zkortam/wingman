import { describe, expect, it } from 'vitest'

import { pipelineInngestFunctions } from './inngest'

describe('pipeline Inngest registration', () => {
  it('registers observation, confirmation, expiry, and retention jobs without eager credentials', () => {
    expect(pipelineInngestFunctions).toHaveLength(4)
  })
})
