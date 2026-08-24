import { describe, expect, it } from 'vitest'

import { PAGE } from './page.js'

describe('PAGE', () => {
  it('offers capability chips rather than a scripted reschedule', () => {
    expect(PAGE).toContain("Where's my package?")
    expect(PAGE).toContain('Leave it at the door')
    expect(PAGE).toContain('Talk to a person')
    expect(PAGE).not.toContain('Try:')
  })

  it('renders expected vs actual in the Wingman rail', () => {
    expect(PAGE).toContain('Last turn')
    expect(PAGE).toContain('This agent can')
  })
})
