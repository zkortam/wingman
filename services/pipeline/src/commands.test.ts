import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createPipelineCommands } from './commands.js'
import { ReplayAppServerClient } from './fix/app-server.js'
import { NoopLedger } from './ledger/index.js'
import { StubConfigStore } from './stubs/config-store.js'
import { ReplayDatabase } from './stubs/database.js'
import { ReplayEventPublisher } from './stubs/events.js'
import { ReplayPipelineRepository } from './stubs/repository.js'

describe('pipeline commands', () => {
  it('validates dismiss reasons and reopens with a new attempt', async () => {
    const database = new ReplayDatabase()
    const repository = new ReplayPipelineRepository(database)
    const configStore = new StubConfigStore(database)
    const id = randomUUID()
    const agentId = randomUUID()
    configStore.seed(agentId, {
      systemPrompt: '',
      tools: {},
      retrieval: {},
      rules: [],
    })
    database.incidents.set(id, {
      id,
      orgId: randomUUID(),
      agentId,
      key: 'key',
      fingerprint: 'fingerprint',
      signalKind: 'RETRY_REQUEST',
      title: 'Incident',
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
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      expiresAt: null,
    })
    const commands = createPipelineCommands({
      repository,
      configStore,
      events: new ReplayEventPublisher(),
      ledger: new NoopLedger(),
      appServer: new ReplayAppServerClient(),
    })
    await expect(commands.dismiss(id, '   ')).rejects.toThrow(/1 to 500/)
    await expect(commands.dismiss(id, 'x'.repeat(501))).rejects.toThrow(/1 to 500/)
    await commands.dismiss(id, 'not actionable')
    expect((await repository.getIncident(id)).stateReason).toBe('OPERATOR_DISMISSED:not actionable')
    await commands.reopen(id)
    const reopened = await repository.getIncident(id)
    expect(reopened.state).toBe('CLUSTERED')
    expect(reopened.attempt).toBe(2)
    const reverted = database.incidents.get(id)
    if (!reverted) throw new Error('missing incident')
    reverted.state = 'REVERTED'
    await commands.reopen(id)
    expect((await repository.getIncident(id)).state).toBe('CLUSTERED')
    expect((await repository.getIncident(id)).attempt).toBe(3)
  })
})
