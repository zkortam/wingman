import { render } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import ConfigPage from '../../app/(app)/config/page'
import InboxPage from '../../app/(app)/inbox/page'
import OutcomesPage from '../../app/(app)/outcomes/page'
import SettingsPage from '../../app/(app)/settings/page'
import { demoIncident } from '../data/demo-incidents'
import { DemoHarness } from './demo/DemoHarness'
import { IncidentProof } from './incidents/IncidentProof'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const incidentClient = {
  apply: vi.fn(async () => ({ outcomeId: 'outcome-1', versionId: 'v2' })),
  dismiss: vi.fn(async () => undefined),
  handoff: vi.fn(async () => ({ payload: '{}' })),
  reopen: vi.fn(async () => undefined),
  revert: vi.fn(async () => undefined),
}

const demoClient = {
  resolveConfig: vi.fn(async () => ({ config: {}, version: 1, signature: 'signed' })),
}

const audit = async (): Promise<void> => {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  expect(result.violations).toEqual([])
}

const productScreens: Array<[string, () => Promise<ReactNode>]> = [
  ['Inbox', () => InboxPage()],
  ['Outcomes', () => OutcomesPage()],
  ['Config', () => ConfigPage()],
  ['Settings', async () => <SettingsPage />],
]

describe('critical flow accessibility', () => {
  it('passes the incident proof audit', async () => {
    const incident = demoIncident('OC-1042')
    if (!incident) throw new Error('Missing fixture')
    render(<main><IncidentProof client={incidentClient} initialIncident={incident} /></main>)
    await audit()
  })

  it('passes the two-window harness audit', async () => {
    render(<DemoHarness client={demoClient} />)
    await audit()
  })

  it.each(productScreens)('passes the %s screen audit', async (_name, makeScreen) => {
    render(<main>{await makeScreen()}</main>)
    await audit()
  })
})
