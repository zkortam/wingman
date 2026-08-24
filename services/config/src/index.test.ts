import { describe, expect, it } from 'vitest'

import { InMemoryConfigRepository, SupabaseConfigStore, WingmanConfigStore } from './index'

describe('config package exports', () => {
  it('publishes only the supported composition surfaces', () => {
    expect(InMemoryConfigRepository).toBeTypeOf('function')
    expect(WingmanConfigStore).toBeTypeOf('function')
    expect(SupabaseConfigStore).toBeTypeOf('function')
  })
})
