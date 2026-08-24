import { randomUUID } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { ReplayFixAgent } from './fix/agent.js'
import { ReplayAppServerClient } from './fix/app-server.js'
import { InMemoryLedger } from './ledger/index.js'
import { processIncident } from './process.js'
import { StubConfigStore } from './stubs/config-store.js'
import { ReplayDatabase } from './stubs/database.js'
import { ReplayEventPublisher } from './stubs/events.js'
import { ReplayModelClient } from './stubs/model.js'
import { ReplayPipelineRepository } from './stubs/repository.js'
import { StubRunner } from './stubs/runner.js'

describe('processIncident', () => {
  it('resumes CLASSIFIED variance without calling the gate model', async () => {
    const { input, id } = classified('VARIANCE')
    const generate = vi.spyOn(input.model, 'generate')
    expect(await processIncident(input)).toMatchObject({
      id,
      state: 'DISCARDED',
      stateReason: 'GATE_VARIANCE',
    })
    expect(generate).not.toHaveBeenCalled()
  })

  it('resumes CLASSIFIED unsupported capability into human review', async () => {
    const { input } = classified('UNSUPPORTED')
    expect(await processIncident(input)).toMatchObject({
      state: 'HUMAN_REVIEW',
      stateReason: 'UNSUPPORTED_CAPABILITY',
    })
  })
})

function requiredIncident(database: ReplayDatabase, id: string) {
  const incident = database.incidents.get(id)
  if (!incident) throw new Error('missing incident')
  return incident
}

function classified(verdict: 'VARIANCE' | 'UNSUPPORTED') {
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
  const model = new ReplayModelClient([])
  return {
    id,
    input: {
      repository,
      runner: new StubRunner(() => ({ toolCalls: [] })),
      configStore,
      model,
      fixAgent: new ReplayFixAgent([]),
      appServer: new ReplayAppServerClient(),
      ledger: new InMemoryLedger(),
      events: new ReplayEventPublisher(),
      logger: { write: () => undefined },
      incident: requiredIncident(database, id),
      session,
    },
  }
}
