import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renders a single screen heading and supporting metadata', () => {
    render(<PageHeader meta="Evidence" title="Incident" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Incident')
    expect(screen.getByText('Evidence')).toBeTruthy()
  })
})
