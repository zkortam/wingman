import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Verdict } from './Verdict'

describe('Verdict', () => {
  it('renders confidence and ranked evidence', () => {
    render(<Verdict verdict={{ kind: 'CONFIG_DEFECT', confidence: 0.86, evidence: ['Tool description', 'User rule'] }} />)
    expect(screen.getByText('CONFIG_DEFECT | 0.86')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
