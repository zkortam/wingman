import { createDatabase, type Database } from '@wingman/db'
import { afterAll, describe, it } from 'vitest'

import { describePipelineRepository, type RepositoryFixture } from './repository.contract.js'
import { createPostgresPipelineRepository } from './store/index.js'
import {
  AGENT,
  EMPTY_ORG,
  INCIDENT,
  ORG,
  SESSION,
  USER_HASH,
  seedFixture,
} from './store/testing/seed.js'
import { ReplayDatabase } from './stubs/database.js'
import { ReplayPipelineRepository } from './stubs/repository.js'

const TURNS = [
  {
    idx: 0,
    role: 'user' as const,
    textRedacted: 'Export the filtered view.',
    toolCalls: [],
    embedding: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    idx: 1,
    role: 'assistant' as const,
    textRedacted: 'Exporting.',
    toolCalls: [{ name: 'export_records', args: {} }],
    embedding: null,
    createdAt: '2026-08-01T00:00:05.000Z',
  },
]

const WRITABLE_POLICY = {
  codexEndpoint: null,
  maxDiffBytes: 4_096,
  writablePaths: ['rules', 'tools.*.description'],
}

describePipelineRepository('Replay', async (): Promise<RepositoryFixture> => {
  const database = new ReplayDatabase()
  database.sessions.set(SESSION, {
    id: SESSION,
    orgId: ORG,
    agentId: AGENT,
    userHash: USER_HASH,
    personaId: null,
    configVersionId: null,
    taskFingerprint: null,
    startedAt: '2026-08-01T00:00:00.000Z',
    endedAt: '2026-08-01T00:01:00.000Z',
    turns: TURNS,
  })
  database.incidents.set(INCIDENT, {
    id: INCIDENT,
    orgId: ORG,
    agentId: AGENT,
    key: 'export-dropped-filter',
    fingerprint: 'fingerprint',
    signalKind: 'RETRY_REQUEST',
    title: 'Export dropped the active filter',
    state: 'CLUSTERED',
    stateReason: null,
    attempt: 1,
    verdict: null,
    verdictConfidence: null,
    verdictEvidence: null,
    assertionId: null,
    userHashes: [USER_HASH],
    sessionIds: [SESSION],
    evidenceExcerpts: [],
    firstSeen: '2026-08-01T00:00:00.000Z',
    lastSeen: '2026-08-02T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
  })
  database.writablePolicies.set(AGENT, WRITABLE_POLICY)
  return {
    repository: new ReplayPipelineRepository(database),
    orgId: ORG,
    agentId: AGENT,
    incidentId: INCIDENT,
    sessionId: SESSION,
    emptyOrgId: EMPTY_ORG,
  }
})

// The same contract against the database production actually runs. Without a
// DATABASE_URL the suite says so rather than passing quietly.
if (process.env.DATABASE_URL) {
  let sql: Database | undefined
  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  describePipelineRepository('Postgres', async (): Promise<RepositoryFixture> => {
    sql ??= createDatabase({ max: 4 })
    await seedFixture(sql)
    return {
      repository: createPostgresPipelineRepository(sql),
      orgId: ORG,
      agentId: AGENT,
      incidentId: INCIDENT,
      sessionId: SESSION,
      emptyOrgId: EMPTY_ORG,
    }
  })
} else {
  describe.skip('Postgres PipelineRepository contract', () => {
    it('needs DATABASE_URL: run `pnpm db:up && pnpm db:migrate`', () => undefined)
  })
}
