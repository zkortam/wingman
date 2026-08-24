import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { applyVerifiedCandidate } from './apply.js'
import { InMemoryLedger } from './ledger/index.js'
import { StubConfigStore } from './stubs/config-store.js'
import { ReplayDatabase } from './stubs/database.js'
import { ReplayEventPublisher } from './stubs/events.js'
import { ReplayPipelineRepository } from './stubs/repository.js'

const AGENT = randomUUID()
const ORG = randomUUID()
const SESSION = randomUUID()
const USER = 'b'.repeat(32)

describe('applyVerifiedCandidate', () => {
  it('refuses an incident that is not a verified candidate', async () => {
    const { database, repository, configStore, events, ledger } = harness()
    const id = randomUUID()
    seedOpen(database, id)
    await expect(
      applyVerifiedCandidate({
        repository,
        configStore,
        events,
        ledger,
        incidentId: id,
        scope: 'USER',
      }),
    ).rejects.toThrow(/verified candidate/)
  })

  it('applies a verified candidate, isolates the control user, and schedules confirmation', async () => {
    const { database, repository, configStore, events, ledger } = harness()
    const ids = seedVerified(database, configStore)
    const applied = await applyVerifiedCandidate({
      repository,
      configStore,
      events,
      ledger,
      incidentId: ids.incidentId,
      scope: 'USER',
    })
    expect(applied.outcomeId).toBeTruthy()
    expect((await repository.getIncident(ids.incidentId)).state).toBe('APPLIED')
    const control = await configStore.resolve(AGENT, 'c'.repeat(32))
    const reporter = await configStore.resolve(AGENT, USER)
    expect(control.systemPrompt).toBe('BROKEN')
    expect(reporter.systemPrompt).toBe('FIXED')
    expect(events.events.some((event) => event.name === 'confirmation.due')).toBe(true)
  })

  it('applies globally without leaving the control user on the old config', async () => {
    const { database, repository, configStore, events, ledger } = harness()
    const ids = seedVerified(database, configStore)
    const globalIncident = database.incidents.get(ids.incidentId)
    if (!globalIncident) throw new Error('missing incident')
    globalIncident.userHashes = [USER, 'c'.repeat(32)]
    await applyVerifiedCandidate({
      repository,
      configStore,
      events,
      ledger,
      incidentId: ids.incidentId,
      scope: 'GLOBAL',
    })
    expect((await configStore.resolve(AGENT, USER)).systemPrompt).toBe('FIXED')
    expect((await configStore.resolve(AGENT, 'c'.repeat(32))).systemPrompt).toBe('FIXED')
  })

  it('applies a later candidate onto the live override, not the compiled base', async () => {
    const { database, repository, configStore, events, ledger } = harness()
    const first = seedVerified(database, configStore)
    await applyVerifiedCandidate({
      repository,
      configStore,
      events,
      ledger,
      incidentId: first.incidentId,
      scope: 'USER',
    })
    const second = seedVerified(database, configStore, {
      before: 'FIXED',
      after: 'FIXED-AGAIN',
    })
    await applyVerifiedCandidate({
      repository,
      configStore,
      events,
      ledger,
      incidentId: second.incidentId,
      scope: 'USER',
    })
    expect((await configStore.resolve(AGENT, USER)).systemPrompt).toBe('FIXED-AGAIN')
    expect((await configStore.resolve(AGENT, 'c'.repeat(32))).systemPrompt).toBe('BROKEN')
  })

  it('is idempotent once an outcome exists', async () => {
    const { database, repository, configStore, events, ledger } = harness()
    const ids = seedVerified(database, configStore)
    const first = await applyVerifiedCandidate({
      repository,
      configStore,
      events,
      ledger,
      incidentId: ids.incidentId,
      scope: 'USER',
    })
    const second = await applyVerifiedCandidate({
      repository,
      configStore,
      events,
      ledger,
      incidentId: ids.incidentId,
      scope: 'USER',
    })
    expect(second).toEqual(first)
  })
})

/** Apply makes a configuration live for real users. */
describe('applyVerifiedCandidate survives a partial failure', () => {
  it('records the outcome before the configuration goes live', async () => {
    const { database, repository, configStore, events, ledger } = harness()
    const ids = seedVerified(database, configStore)
    const order: string[] = []
    const createOutcome = repository.createOutcome.bind(repository)
    repository.createOutcome = async (outcomeInput) => {
      order.push('outcome')
      return createOutcome(outcomeInput)
    }
    const setOverride = configStore.setOverride.bind(configStore)
    configStore.setOverride = async (...args) => {
      order.push('override')
      return setOverride(...args)
    }
    await applyVerifiedCandidate({
      repository,
      configStore,
      events,
      ledger,
      incidentId: ids.incidentId,
      scope: 'USER',
    })
    expect(order).toEqual(['outcome', 'override'])
  })

  it('leaves a revertable outcome when the override write fails', async () => {
    const { database, repository, configStore, events, ledger } = harness()
    const ids = seedVerified(database, configStore)
    configStore.setOverride = async () => {
      throw new Error('connection reset')
    }
    await expect(
      applyVerifiedCandidate({
        repository,
        configStore,
        events,
        ledger,
        incidentId: ids.incidentId,
        scope: 'USER',
      }),
    ).rejects.toThrow(/connection reset/)
    // Without an outcome row there is nothing for revert to act on.
    expect(await repository.getOutcomeForIncident(ids.incidentId)).not.toBeNull()
  })

  it('completes the apply on retry instead of reporting success over a half-applied state', async () => {
    const { database, repository, configStore, events, ledger } = harness()
    const ids = seedVerified(database, configStore)
    const setOverride = configStore.setOverride.bind(configStore)
    configStore.setOverride = async () => {
      throw new Error('connection reset')
    }
    await expect(
      applyVerifiedCandidate({
        repository,
        configStore,
        events,
        ledger,
        incidentId: ids.incidentId,
        scope: 'USER',
      }),
    ).rejects.toThrow()
    expect((await configStore.resolve(AGENT, USER)).systemPrompt).toBe('BROKEN')

    configStore.setOverride = setOverride
    await applyVerifiedCandidate({
      repository,
      configStore,
      events,
      ledger,
      incidentId: ids.incidentId,
      scope: 'USER',
    })
    expect((await configStore.resolve(AGENT, USER)).systemPrompt).toBe('FIXED')
    expect((await repository.getIncident(ids.incidentId)).state).toBe('APPLIED')
  })
})
function harness() {
  const database = new ReplayDatabase()
  return {
    database,
    repository: new ReplayPipelineRepository(database),
    configStore: new StubConfigStore(database),
    events: new ReplayEventPublisher(),
    ledger: new InMemoryLedger(),
  }
}

function seedOpen(database: ReplayDatabase, id: string): void {
  database.incidents.set(id, {
    id,
    orgId: ORG,
    agentId: AGENT,
    key: 'k',
    fingerprint: 'fp',
    signalKind: 'RETRY_REQUEST',
    title: 'Open',
    state: 'OPEN',
    stateReason: null,
    attempt: 1,
    verdict: null,
    verdictConfidence: null,
    verdictEvidence: null,
    assertionId: null,
    userHashes: [USER],
    sessionIds: [SESSION],
    evidenceExcerpts: [],
    firstSeen: '2026-08-23T00:00:00.000Z',
    lastSeen: '2026-08-23T00:00:00.000Z',
    expiresAt: null,
  })
}

function seedVerified(
  database: ReplayDatabase,
  configStore: StubConfigStore,
  change: { before: string; after: string } = { before: 'BROKEN', after: 'FIXED' },
): { incidentId: string } {
  const baseVersionId =
    database.baseVersionIds.get(AGENT) ??
    configStore.seed(AGENT, {
      systemPrompt: 'BROKEN',
      tools: {},
      retrieval: {},
      rules: [],
    })
  const assertionId = randomUUID()
  const incidentId = randomUUID()
  const candidateId = randomUUID()
  database.sessions.set(SESSION, {
    id: SESSION,
    orgId: ORG,
    agentId: AGENT,
    userHash: USER,
    taskFingerprint: 'fp',
    startedAt: '2026-08-23T00:00:00.000Z',
    turns: [],
  })
  database.assertions.set(assertionId, {
    id: assertionId,
    incidentId,
    agentId: AGENT,
    definition: { kind: 'TOOL_CALLED', tool: 'export_records' },
    identity: 'a'.repeat(64),
    sourceSessionId: SESSION,
    polarity: 'negative',
    createdAt: '2026-08-23T00:00:00.000Z',
  })
  database.incidents.set(incidentId, {
    id: incidentId,
    orgId: ORG,
    agentId: AGENT,
    key: 'k',
    fingerprint: 'fp',
    signalKind: 'RETRY_REQUEST',
    title: 'Export ignores filters',
    state: 'CANDIDATE',
    stateReason: null,
    attempt: 1,
    verdict: 'CONFIG_DEFECT',
    verdictConfidence: 0.9,
    verdictEvidence: {},
    assertionId,
    userHashes: [USER],
    sessionIds: [SESSION],
    evidenceExcerpts: [],
    firstSeen: '2026-08-23T00:00:00.000Z',
    lastSeen: '2026-08-23T00:00:00.000Z',
    expiresAt: null,
  })
  database.candidates.set(candidateId, {
    id: candidateId,
    incidentId,
    diff: {
      changes: [{ path: 'systemPrompt', before: change.before, after: change.after }],
    },
    diffBytes: 20,
    baseVersionId,
    newVersionId: null,
    attempt: 1,
    iteration: 1,
    state: 'VERIFIED',
    rejectedReason: null,
    createdAt: '2026-08-23T00:00:00.000Z',
  })
  const fail = {
    id: randomUUID(),
    assertionId,
    incidentId,
    phase: 'VERIFY_FAIL' as const,
    attempt: 1,
    configVersionId: null,
    candidateId: null,
    n: 5,
    passCount: 0,
    results: [],
    toolExecutions: 0 as const,
    createdAt: '2026-08-23T00:00:00.000Z',
  }
  const pass = {
    ...fail,
    id: randomUUID(),
    phase: 'VERIFY_PASS' as const,
    candidateId,
    passCount: 5,
  }
  database.runs.set(`${assertionId}:VERIFY_FAIL:1:base`, fail)
  database.runs.set(`${assertionId}:VERIFY_PASS:1:${candidateId}`, pass)
  return { incidentId }
}
