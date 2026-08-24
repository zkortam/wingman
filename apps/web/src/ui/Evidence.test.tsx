import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Evidence } from './Evidence'

describe('Evidence', () => {
  it('states that displayed transcripts were redacted before transmission', () => {
    render(<Evidence sessions={[]} />)
    expect(screen.getByText(/Redacted in the customer's process/)).toBeTruthy()
  })

  it('shows only the signal context until expanded', () => {
    const session = {
      id: 's1', signal: 'RETRY_REQUEST' as const, confidence: 0.8, baseline: 0.1,
      turns: [
        { role: 'user' as const, text: 'Original request' },
        { role: 'assistant' as const, text: 'Incorrect answer' },
        { role: 'user' as const, text: 'Retry request', signaled: true },
      ],
    }
    const { rerender } = render(<Evidence sessions={[session]} />)
    expect(screen.queryByText('Original request')).toBeNull()
    expect(screen.getByText('Retry request').closest('[data-signaled]')?.getAttribute('data-signaled')).toBe('true')
    rerender(<Evidence expanded sessions={[session]} />)
    expect(screen.getByText('Original request')).toBeTruthy()
  })
})
