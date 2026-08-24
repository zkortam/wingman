import { describe, expect, it } from 'vitest'

import { InMemoryCrm } from './crm'

describe('InMemoryCrm', () => {
  it('seeds 50 opportunities and audits only mutations and exports', () => {
    const crm = new InMemoryCrm()
    expect(crm.search()).toHaveLength(50)
    expect(crm.search({ stage: 'Negotiation' })).toHaveLength(10)
    expect(crm.auditCount()).toBe(0)
    crm.export({ stage: 'Negotiation' })
    expect(crm.auditCount()).toBe(1)
  })
})
