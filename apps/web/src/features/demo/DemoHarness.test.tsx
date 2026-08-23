import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DEMO_REPORTER_HASH } from '../../domain/demo'
import { DemoHarness } from './DemoHarness'

const client = {
  resolveConfig: vi.fn(async (_agent: string, userHash: string) => ({
    config: {},
    version: userHash === DEMO_REPORTER_HASH ? 2 : 1,
    signature: 'signed',
  })),
}

describe('DemoHarness', () => {
  it('keeps the control user unchanged after the reporter resolves v2', async () => {
    render(<DemoHarness client={client} />)
    const reporter = screen.getByLabelText('reporter demo window')
    const control = screen.getByLabelText('control demo window')

    expect(await within(reporter).findByText('config v2')).toBeTruthy()
    expect(within(control).getByText('config v1')).toBeTruthy()
    await userEvent.click(within(reporter).getByRole('button', { name: 'Send' }))
    await userEvent.click(within(control).getByRole('button', { name: 'Send' }))
    expect(within(reporter).getByText(/10 Negotiation-stage/)).toBeTruthy()
    expect(within(control).getByText(/all 50/)).toBeTruthy()
  })

  it('does not send an empty message', async () => {
    render(<DemoHarness client={client} />)
    const reporter = screen.getByLabelText('reporter demo window')
    const input = within(reporter).getByRole('textbox')
    await userEvent.clear(input)
    expect(within(reporter).getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true)
  })
})
