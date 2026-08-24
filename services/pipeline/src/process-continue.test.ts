import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { continueFromClassified } from './process-continue.js'
import { ReplayFixAgent } from './fix/agent.js'
import { ReplayAppServerClient } from './fix/app-server.js'
import { InMemoryLedger } from './ledger/index.js'
import { StubConfigStore } from './stubs/config-store.js'
import { ReplayDatabase } from './stubs/database.js'
import { ReplayEventPublisher } from './stubs/events.js'
import { ReplayModelClient } from './stubs/model.js'
import { ReplayPipelineRepository } from './stubs/repository.js'
import { StubRunner } from './stubs/runner.js'

describe('continueFromClassified', () => {
  it('discards model variance before spending a verification budget', async () => {
    const input = classified('VARIANCE')
    await expect(continueFromClassified(input)).resolves.toMatchObject({
      state: 'DISCARDED',
      stateReason: 'GATE_VARIANCE',
    })
  })
})

function requiredIncident(database: ReplayDatabase, id: string) {
  const incident = database.incidents.get(id)
  if (!incident) throw new Error('missing incident')
  return incident
}

function classified(verdict: 'VARIANCE') {
  const database = new ReplayDatabase()
  const repository = new ReplayPipelineRepository(database)
  const configStore = new StubConfigStore(database)
  const agentId = randomUUID()
  const sessionId = randomUUID()
  const id = randomUUID()
  configStore.seed(agentId, {
    systemPrompt: 'base',
    tools: {},
    retrieval: {},
    rules: [],
  })
  const session = {
    id: sessionId,
    orgId: randomUUID(),
    agentId,
    userHash: 'a'.repeat(32),
    taskFingerprint: 'fp',
    startedAt: '2026-08-23T00:00:00.000Z',
    turns: [],
  }
  database.sessions.set(sessionId, session)
  database.incidents.set(id, {
    id,
    orgId: session.orgId,
    agentId,
    key: 'k',
    fingerprint: 'fp',
    signalKind: 'RETRY_REQUEST',
    title: 'Incident',
    state: 'CLASSIFIED',
    stateReason: null,
    attempt: 1,
    verdict,
    verdictConfidence: 0.9,
    verdictEvidence: {},
    assertionId: null,
    userHashes: [session.userHash],
    sessionIds: [sessionId],
    evidenceExcerpts: [],
    firstSeen: session.startedAt,
    lastSeen: session.startedAt,
    expiresAt: null,
  })
  return {
    repository,
    runner: new StubRunner(() => ({ toolCalls: [] })),
    configStore,
    model: new ReplayModelClient([]),
    fixAgent: new ReplayFixAgent([]),
    appServer: new ReplayAppServerClient(),
    ledger: new InMemoryLedger(),
    events: new ReplayEventPublisher(),
    logger: { write: () => undefined },
    incident: requiredIncident(database, id),
    session,
  }
}
