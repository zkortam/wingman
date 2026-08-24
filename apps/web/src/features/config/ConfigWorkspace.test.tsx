import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConfigWorkspace } from './ConfigWorkspace'

const client = { revert: vi.fn(async () => undefined) }
const versions = [
  { id: 'version-1', version: 1, incidentId: null },
  { id: 'version-2', version: 2, incidentId: 'OC-1042' },
]
const identity = { agentId: 'agent-production', userHash: 'hashed-production-user' }

describe('ConfigWorkspace', () => {
  it('compares immutable versions and links their incident', () => {
    render(<ConfigWorkspace {...identity} client={client} initialOverrideActive versions={versions} />)
    expect(screen.getByRole('link', { name: 'OC-1042' }).getAttribute('href')).toBe('/incidents/OC-1042')
    expect(screen.getByText(/Pass the caller's active view filters/)).toBeTruthy()
  })

  it('requires confirmation and removes a reverted override', async () => {
    render(<ConfigWorkspace {...identity} client={client} initialOverrideActive versions={versions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('No active per-user overrides.')).toBeTruthy()
    expect(screen.getByText('Override reverted')).toBeTruthy()
    expect(client.revert).toHaveBeenCalledWith(identity.agentId, identity.userHash)
  })
})
