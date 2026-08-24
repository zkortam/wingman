import { describe, expect, it } from 'vitest'

import { InngestEventPublisher } from './production'

describe('InngestEventPublisher', () => {
  it('refuses to create a publisher without an event key', () => {
    expect(() => new InngestEventPublisher('')).toThrow('INNGEST_EVENT_KEY is required')
  })
})
