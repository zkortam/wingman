import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import OperatorError from './error'

describe('operator error boundary', () => {
  it('explains that an unavailable backend did not apply an operation', async () => {
    const reset = vi.fn()
    render(<OperatorError error={new Error('private detail')} reset={reset} />)
    expect(screen.getByRole('alert').textContent).toContain('Your operation was not applied')
    expect(screen.queryByText('private detail')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
