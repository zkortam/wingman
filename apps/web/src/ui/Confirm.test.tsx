import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Confirm } from './Confirm'

describe('Confirm', () => {
  it('uses an accessible modal and returns cancellation', async () => {
    const cancel = vi.fn()
    render(
      <Confirm
        body="Global impact"
        onCancel={cancel}
        onConfirm={vi.fn()}
        title="Apply globally?"
      />,
    )
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('closes on escape', async () => {
    const cancel = vi.fn()
    render(
      <Confirm
        body="Global impact"
        onCancel={cancel}
        onConfirm={vi.fn()}
        title="Apply globally?"
      />,
    )
    await userEvent.keyboard('{Escape}')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('keeps keyboard focus inside the destructive confirmation', async () => {
    render(
      <Confirm
        body="Global impact"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Apply globally?"
      />,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toBe(document.activeElement)
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBe(document.activeElement)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBe(document.activeElement)
  })
})
