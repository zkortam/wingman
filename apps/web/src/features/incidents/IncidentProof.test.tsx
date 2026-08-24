import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { demoIncident } from '../../data/demo-incidents'
import { INCIDENT_STATES } from '../../domain/incidents'
import { IncidentProof } from './IncidentProof'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const client = {
  apply: vi.fn(async () => ({ outcomeId: 'outcome-1', versionId: 'v2' })),
  dismiss: vi.fn(async () => undefined),
  handoff: vi.fn(async () => ({ payload: '{}' })),
  reopen: vi.fn(async () => undefined),
  revert: vi.fn(async () => undefined),
  getIncident: vi.fn(async (id: string) => {
    const incident = demoIncident(id)
    if (!incident) throw new Error('Missing fixture')
    return incident
  }),
}

describe('IncidentProof', () => {
  it('renders every incident state without a crash', () => {
    const seed = demoIncident('OC-1042')
    if (!seed) throw new Error('Missing fixture')
    for (const state of INCIDENT_STATES) {
      const { unmount } = render(
        <IncidentProof client={client} initialIncident={{ ...seed, state }} />,
      )
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
      unmount()
    }
  })

  it('shows only completed proof blocks in early lifecycle states', () => {
    const seed = demoIncident('OC-1042')
    if (!seed) throw new Error('Missing fixture')
    const expected = {
      OPEN: ['EVIDENCE'],
      CLASSIFIED: ['EVIDENCE', 'CLASSIFIED'],
      ASSERTED: ['EVIDENCE', 'CLASSIFIED', 'ASSERTION', 'BEFORE'],
    }
    for (const [state, labels] of Object.entries(expected)) {
      const { container, unmount } = render(
        <IncidentProof
          client={client}
          initialIncident={{ ...seed, state: state as 'OPEN' | 'CLASSIFIED' | 'ASSERTED' }}
        />,
      )
      expect(
        [...container.querySelectorAll('.proof-label')].map((node) => node.textContent),
      ).toEqual(labels)
      if (state === 'ASSERTED') expect(screen.getByText('Running verification')).toBeTruthy()
      unmount()
    }
  })
  it('preserves the fail-change-pass reading order', () => {
    const incident = demoIncident('OC-1042')
    if (!incident) throw new Error('Missing fixture')
    const { container } = render(<IncidentProof client={client} initialIncident={incident} />)
    const labels = [...container.querySelectorAll('.proof-label')].map((node) => node.textContent)
    expect(labels.indexOf('BEFORE')).toBeLessThan(labels.indexOf('CHANGE'))
    expect(labels.indexOf('CHANGE')).toBeLessThan(labels.indexOf('AFTER'))
  })

  it('applies a user-scoped candidate without a confirmation modal', async () => {
    const incident = demoIncident('OC-1042')
    if (!incident) throw new Error('Missing fixture')
    render(<IncidentProof client={client} initialIncident={incident} />)
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText(/Applied to 12 users/)).toBeTruthy()
  })

  it('renders a discarded variance as a refusal, not an error', () => {
    const incident = demoIncident('OC-1038')
    if (!incident) throw new Error('Missing fixture')
    render(<IncidentProof client={client} initialIncident={incident} />)
    expect(screen.getByText('Discarded: model variance')).toBeTruthy()
    expect(screen.getByText(/Intermittent, not a defect/)).toBeTruthy()
  })

  it('requires explicit confirmation for a global apply', async () => {
    const incident = demoIncident('OC-1042')
    if (!incident) throw new Error('Missing fixture')
    incident.scope = 'GLOBAL'
    render(<IncidentProof client={client} initialIncident={incident} />)
    await userEvent.click(screen.getByRole('button', { name: 'Apply globally' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText(/Applied to 12 users/)).toBeTruthy()
  })

  it('renders code defects as a handoff inside human review', () => {
    const incident = demoIncident('OC-1029')
    if (!incident) throw new Error('Missing fixture')
    render(<IncidentProof client={client} initialIncident={incident} />)
    expect(screen.getByText('Handed off to Codex')).toBeTruthy()
    expect(screen.getByText('Copy payload')).toBeTruthy()
  })

  it('provides keyboard paths for evidence, navigation, copy, and dismiss', async () => {
    const incident = demoIncident('OC-1042')
    if (!incident) throw new Error('Missing fixture')
    render(
      <IncidentProof
        client={client}
        initialIncident={incident}
        nextId="OC-1038"
        previousId="OC-1008"
      />,
    )
    await userEvent.keyboard('e]')
    expect(screen.getByRole('button', { name: 'Collapse evidence' })).toBeTruthy()
    expect(push).toHaveBeenCalledWith('/incidents/OC-1038')
    await userEvent.keyboard('x')
    expect(await screen.findAllByText('Dismissed by operator')).toHaveLength(2)
  })

  /** The single-letter shortcuts sit directly under the browser's own Select All, Copy, and Cut. */
  it.each([
    ['{Meta>}a{/Meta}', 'apply'],
    ['{Control>}a{/Control}', 'apply'],
    ['{Meta>}x{/Meta}', 'dismiss'],
    ['{Control>}x{/Control}', 'dismiss'],
  ])('ignores %s so it does not trigger %s', async (chord, action) => {
    const incident = demoIncident('OC-1042')
    if (!incident) throw new Error('Missing fixture')
    const apply = vi.fn(async () => ({ outcomeId: 'outcome-1', versionId: 'v2' }))
    const dismiss = vi.fn(async () => undefined)
    render(<IncidentProof client={{ ...client, apply, dismiss }} initialIncident={incident} />)
    await userEvent.keyboard(chord)
    expect(action === 'apply' ? apply : dismiss).not.toHaveBeenCalled()
  })

  it('still runs the unmodified shortcut', async () => {
    const incident = demoIncident('OC-1042')
    if (!incident) throw new Error('Missing fixture')
    const dismiss = vi.fn(async () => undefined)
    render(<IncidentProof client={{ ...client, dismiss }} initialIncident={incident} />)
    await userEvent.keyboard('x')
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('prevents duplicate apply submissions while a request is pending', async () => {
    const incident = demoIncident('OC-1042')
    if (!incident) throw new Error('Missing fixture')
    let finish: ((value: { outcomeId: string; versionId: string }) => void) | undefined
    const apply = vi.fn(
      () =>
        new Promise<{ outcomeId: string; versionId: string }>((resolve) => {
          finish = resolve
        }),
    )
    render(<IncidentProof client={{ ...client, apply }} initialIncident={incident} />)
    const button = screen.getByRole('button', { name: 'Apply' })
    await userEvent.dblClick(button)
    expect(apply).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Applying' })).toBeTruthy()
    finish?.({ outcomeId: 'outcome-1', versionId: 'v2' })
    expect(await screen.findByText(/Applied to 12 users/)).toBeTruthy()
  })

  it('persists a reopen through the command client', async () => {
    const incident = demoIncident('OC-1038')
    if (!incident) throw new Error('Missing fixture')
    const reopened = { ...incident, state: 'CLUSTERED' as const, stateReason: 'OPERATOR_REOPENED' }
    const reopen = vi.fn(async () => undefined)
    const getIncident = vi.fn(async () => reopened)
    render(<IncidentProof client={{ ...client, reopen, getIncident }} initialIncident={incident} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(reopen).toHaveBeenCalledWith('OC-1038')
    expect(await screen.findByText('Collecting evidence')).toBeTruthy()
  })
})
