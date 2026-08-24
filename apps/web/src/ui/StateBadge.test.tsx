import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StateBadge } from './StateBadge'

describe('StateBadge', () => {
  it('exposes the state as text and a styling attribute', () => {
    render(<StateBadge state="HUMAN_REVIEW" />)
    expect(screen.getByText('HUMAN_REVIEW').getAttribute('data-state')).toBe('HUMAN_REVIEW')
  })
})
