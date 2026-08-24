import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Rail } from './Rail'

const push = vi.fn()
vi.mock('next/navigation', () => ({ usePathname: () => '/inbox', useRouter: () => ({ push }) }))

describe('Rail', () => {
  beforeEach(() => { document.documentElement.dataset.theme = '' })

  it('shows four product destinations and the shortcut sheet', async () => {
    render(<Rail />)
    expect(screen.getAllByRole('link')).toHaveLength(4)
    await userEvent.click(screen.getByRole('button', { name: /keys/ }))
    expect(screen.getByLabelText('Keyboard shortcuts')).toBeTruthy()
  })

  it('switches the complete token theme', async () => {
    render(<Rail />)
    await userEvent.click(screen.getByRole('button', { name: 'Use dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('supports every global navigation chord', async () => {
    render(<Rail />)
    await userEvent.keyboard('gogcgs gi')
    expect(push.mock.calls.map(([path]) => path)).toEqual(['/outcomes', '/config', '/settings', '/inbox'])
  })
})
