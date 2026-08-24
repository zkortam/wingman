import { randomUUID } from 'node:crypto'

import {
  describeAgentRunner,
  describeConfigStore,
  describeEmbeddingClient,
  describeLedger,
  describePipelineCommands,
  describePipelineReader,
} from '@wingman/schema/contracts'

import { createPipelineCommands } from '../commands.js'
import { ReplayAppServerClient } from '../fix/app-server.js'
import { InMemoryLedger } from '../ledger/index.js'
import { createPipelineReader } from '../reader.js'
import { StubConfigStore } from './config-store.js'
import { ReplayDatabase } from './database.js'
import { ReplayEmbeddingClient } from './embedding.js'
import { ReplayEventPublisher } from './events.js'
import { ReplayPipelineRepository } from './repository.js'
import { StubRunner } from './runner.js'

describeAgentRunner('StubRunner', () => ({
  // Samples 2 and 4 preserve the filter, the rest drop it: a genuine 2/5 that the variance gate must.
  runner: new StubRunner(({ sample }) => ({
    toolCalls: [
      {
        name: 'export_records',
        args: { filters: sample === 2 || sample === 4 ? { stage: 'New' } : {} },
      },
    ],
  })),
  variance: {
    config: {
      systemPrompt: 'base',
      tools: { export_records: { description: 'Export records' } },
      retrieval: {},
      rules: [],
    },
    messages: [
      {
        idx: 0,
        role: 'user' as const,
        textRedacted: 'Export these',
        toolCalls: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    context: { viewFilters: { stage: 'New' } },
  },
}))
describeEmbeddingClient('Replay', () => new ReplayEmbeddingClient())
describeLedger('InMemory', () => new InMemoryLedger())
describeConfigStore('Stub', async () => {
  const database = new ReplayDatabase()
  const store = new StubConfigStore(database)
  const agentId = randomUUID()
  store.seed(agentId, {
    systemPrompt: 'base',
    tools: {},
    retrieval: {},
    rules: [],
  })
  return { store, agentId, userHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
})

describePipelineReader('Replay', async () => {
  const fixture = replayIncident()
  return {
    reader: createPipelineReader(fixture.repository),
    orgId: fixture.orgId,
    incidentId: fixture.incidentId,
  }
})

describePipelineCommands('Replay', async () => {
  const fixture = replayIncident()
  const configStore = new StubConfigStore(fixture.database)
  configStore.seed(fixture.agentId, {
    systemPrompt: '',
    tools: {},
    retrieval: {},
    rules: [],
  })
  return {
    commands: createPipelineCommands({
      repository: fixture.repository,
      configStore,
      events: new ReplayEventPublisher(),
      ledger: new InMemoryLedger(),
      appServer: new ReplayAppServerClient(),
    }),
    incidentId: fixture.incidentId,
    read: () => fixture.repository.getIncident(fixture.incidentId),
  }
})

function replayIncident() {
  const database = new ReplayDatabase()
  const repository = new ReplayPipelineRepository(database)
  const incidentId = randomUUID()
  const orgId = randomUUID()
  const agentId = randomUUID()
  const timestamp = new Date().toISOString()
  database.incidents.set(incidentId, {
    id: incidentId,
    orgId,
    agentId,
    key: 'key',
    fingerprint: 'fingerprint',
    signalKind: 'RETRY_REQUEST',
    title: 'Contract incident',
    state: 'PARKED',
    stateReason: 'CAP_EXCEEDED',
    attempt: 1,
    verdict: null,
    verdictConfidence: null,
    verdictEvidence: null,
    assertionId: null,
    userHashes: [],
    sessionIds: [],
    evidenceExcerpts: [],
    firstSeen: timestamp,
    lastSeen: timestamp,
    expiresAt: null,
  })
  return { database, repository, incidentId, orgId, agentId }
}
