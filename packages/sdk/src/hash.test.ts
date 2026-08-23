import { describe, expect, it } from 'vitest'

import { hashUserId } from './hash'

describe('hashUserId', () => {
  it('is stable within an org and unlinkable across orgs', () => {
    expect(hashUserId('salt-a', 'person@example.com')).toBe(hashUserId('salt-a', 'person@example.com'))
    expect(hashUserId('salt-a', 'person@example.com')).not.toBe(hashUserId('salt-b', 'person@example.com'))
    expect(hashUserId('salt-a', 'person@example.com')).not.toContain('person')
  })
})
