import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ServiceUnavailable } from './ServiceUnavailable'

describe('ServiceUnavailable', () => {
  it('states that a failed service read changed nothing', () => {
    render(<ServiceUnavailable resource="Incidents" />)
    expect(screen.getByRole('alert').textContent).toContain('Nothing was changed')
    expect(screen.getByRole('heading').textContent).toBe('Incidents unavailable')
  })
})
