import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LiveIncidentTable } from './LiveIncidentTable'

const listIncidents = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const initial = [{ id: 'OC-1', title: 'Export', users: 12, firstSeen: new Date().toISOString(), state: 'CANDIDATE' as const }]

describe('LiveIncidentTable', () => {
  afterEach(() => vi.useRealTimers())

  it('updates the affected-user count without animation', async () => {
    vi.useFakeTimers()
    listIncidents.mockResolvedValue([{ ...initial[0], users: 13 }])
    render(<LiveIncidentTable client={{ listIncidents }} initialIncidents={initial} />)
    expect(screen.getByText('12')).toBeTruthy()
    await act(async () => vi.advanceTimersByTimeAsync(2_000))
    expect(screen.getByText('13')).toBeTruthy()
  })

  it('renders a factual new-organization empty state', () => {
    render(<LiveIncidentTable client={{ listIncidents }} initialIncidents={[]} />)
    expect(screen.getByText(/Wingman needs enough recurring sessions/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View integration guide' })).toBeTruthy()
  })
})
