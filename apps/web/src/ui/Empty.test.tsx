import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Empty } from './Empty'

describe('Empty', () => {
  it('states one fact and offers one action', () => {
    render(<Empty action={{ href: '/settings', label: 'View integration guide' }} fact="No incidents yet." />)
    expect(screen.getByText('No incidents yet.')).toBeTruthy()
    expect(screen.getByRole('link')).toBeTruthy()
  })
})
