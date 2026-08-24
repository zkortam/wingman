import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { IncidentTable } from './IncidentTable'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const incidents = [
  { id: 'OC-1', title: 'First', users: 2, firstSeen: new Date().toISOString(), state: 'CANDIDATE' as const },
  { id: 'OC-2', title: 'Second', users: 1, firstSeen: new Date().toISOString(), state: 'PARKED' as const },
]

describe('IncidentTable', () => {
  it('uses real table semantics and keyboard selection', async () => {
    render(<IncidentTable incidents={incidents} />)
    expect(screen.getAllByRole('columnheader')).toHaveLength(4)
    await userEvent.keyboard('j{Enter}')
    expect(push).toHaveBeenCalledWith('/incidents/OC-2')
  })
})
