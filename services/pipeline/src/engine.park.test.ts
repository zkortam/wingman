import { describe, expect, it } from 'vitest'

import type { IncidentRecord } from './domain.js'
import { createPipelineEngine } from './engine.js'
import { ReplayFixAgent } from './fix/agent.js'
import { ReplayAppServerClient } from './fix/app-server.js'
import { InMemoryLedger } from './ledger/index.js'
import { StubConfigStore } from './stubs/config-store.js'
import { ReplayDatabase } from './stubs/database.js'
import { ReplayEventPublisher } from './stubs/events.js'
import { ReplayModelClient } from './stubs/model.js'
import { ReplayPipelineRepository } from './stubs/repository.js'
import { StubRunner } from './stubs/runner.js'
import type { IngestService } from '@wingman/ingest'

const ORG = '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26'
const AGENT = '4ee0d899-d63d-4bc2-b47a-25aa25c6078b'
const SESSION = '33333333-3333-4333-8333-333333333333'

const incident = (id: string, state: IncidentRecord['state']): IncidentRecord => ({
  id,
  orgId: ORG,
  agentId: AGENT,
  key: `key-${id}`,
  fingerprint: 'fingerprint',
  signalKind: 'RETRY_REQUEST',
  title: 'Export dropped the active filter',
  state,
  stateReason: null,
  attempt: 1,
  verdict: null,
  verdictConfidence: null,
  verdictEvidence: null,
  assertionId: null,
  userHashes: ['a'.repeat(32)],
  sessionIds: [SESSION],
  evidenceExcerpts: [],
  firstSeen: '2026-08-01T00:00:00.000Z',
  lastSeen: '2026-08-02T00:00:00.000Z',
  expiresAt: '2026-09-01T00:00:00.000Z',
})

const harness = () => {
  const database = new ReplayDatabase()
  const repository = new ReplayPipelineRepository(database)
  const engine = createPipelineEngine({
    repository,
    ingest: { writeSignals: async () => undefined } as unknown as IngestService,
    runner: new StubRunner(() => ({ toolCalls: [] })),
    configStore: new StubConfigStore(database),
    model: new ReplayModelClient([]),
    fixAgent: new ReplayFixAgent([]),
    appServer: new ReplayAppServerClient(),
    ledger: new InMemoryLedger(),
    events: new ReplayEventPublisher(),
    logger: { write: () => undefined },
  })
  return { database, repository, engine }
}

/** The state machine does not allow APPLIED or HUMAN_REVIEW to become PARKED. */
describe('parking never reports a state the incident did not reach', () => {
  it.each([
    ['APPLIED', 'APPLIED' as const],
    ['HUMAN_REVIEW', 'HUMAN_REVIEW' as const],
  ])('leaves a %s incident in its real state when a stage fails', async (_name, state) => {
    const { database, repository, engine } = harness()
    const id = '22222222-2222-4222-8222-222222222222'
    database.incidents.set(id, incident(id, state))

    const resumed = await engine.resumeIncident(id)

    expect(resumed.state).toBe(state)
    expect((await repository.getIncident(id)).state).toBe(state)
  })

  it('records why a stage failed even when parking is not permitted', async () => {
    const { database, repository, engine } = harness()
    const id = '22222222-2222-4222-8222-222222222223'
    database.incidents.set(id, { ...incident(id, 'CLUSTERED'), sessionIds: [] })

    await engine.resumeIncident(id)

    expect((await repository.getIncident(id)).stateReason).toBe('SESSION_EVIDENCE_EXPIRED')
  })

  it('parks from a state the machine does allow', async () => {
    const { database, repository, engine } = harness()
    const id = '22222222-2222-4222-8222-222222222224'
    database.incidents.set(id, { ...incident(id, 'CLUSTERED'), sessionIds: [] })

    const resumed = await engine.resumeIncident(id)

    expect(resumed.state).toBe('PARKED')
    expect((await repository.getIncident(id)).state).toBe('PARKED')
  })
})
