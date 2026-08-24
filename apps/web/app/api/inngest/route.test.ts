import { describe, expect, it } from 'vitest'

import { GET, POST, PUT } from './route'

describe('Inngest route', () => {
  it('serves all methods required for registration and invocation', () => {
    expect(GET).toBeTypeOf('function')
    expect(POST).toBeTypeOf('function')
    expect(PUT).toBeTypeOf('function')
  })
})
