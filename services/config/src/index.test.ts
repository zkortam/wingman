import { describe, expect, it } from 'vitest'

import { InMemoryConfigRepository, OutcomeConfigStore, SupabaseConfigStore } from './index'

describe('config package exports', () => {
  it('publishes only the supported composition surfaces', () => {
    expect(InMemoryConfigRepository).toBeTypeOf('function')
    expect(OutcomeConfigStore).toBeTypeOf('function')
    expect(SupabaseConfigStore).toBeTypeOf('function')
  })
})
