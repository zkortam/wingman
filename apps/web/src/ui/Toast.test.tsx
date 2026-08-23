import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Toast } from './Toast'

describe('Toast', () => {
  it('announces its single-line message politely', () => {
    render(<Toast message="Applied" />)
    expect(screen.getByRole('status').textContent).toBe('Applied')
  })
})
