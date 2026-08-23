import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PrintButton } from './PrintButton'

describe('PrintButton', () => {
  it('opens the browser print flow', async () => {
    const print = vi.fn()
    Object.defineProperty(window, 'print', { configurable: true, value: print })
    render(<PrintButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Print / PDF' }))
    expect(print).toHaveBeenCalledOnce()
  })
})
