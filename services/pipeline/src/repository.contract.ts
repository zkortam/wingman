import { SignalKindSchema } from '@wingman/schema'
import { describe, expect, it } from 'vitest'

import type { IncidentRecord, ObservedSession } from './domain.js'
import type { PipelineRepository } from './repository.js'

/** The behaviour every PipelineRepository must have, run against every implementation. */
export interface RepositoryFixture {
  repository: PipelineRepository
  orgId: string
  agentId: string
  /** An incident that already exists, in a processable state. */
  incidentId: string
  /** A session already stored and joined to that incident. */
  sessionId: string
  /** An organisation with no incidents. */
  emptyOrgId: string
}

const handoffPayload = () => ({
  task: 'Export dropped the active filter.',
  context: {
    failingAssertion: {
      kind: 'TOOL_ARG_EQUALS' as const,
      tool: 'export_records',
      arg: 'filters',
      expected: { $ref: 'session.viewFilters' as const },
    },
    failingRuns: [],
    affectedUsers: [],
    sessions: [],
    priorAttempts: [],
  },
  constraints: { maxIterations: 5 as const, requireTestPass: true as const },
})

export function describePipelineRepository(
  name: string,
  setup: () => Promise<RepositoryFixture>,
): void {
  describe(`${name} PipelineRepository contract`, () => {
    it('reads a stored session with its turns in order', async () => {
      const { repository, sessionId } = await setup()
      const session: ObservedSession = await repository.getSession(sessionId)
      expect(session.id).toBe(sessionId)
      expect(session.turns.map(({ idx }) => idx)).toEqual(
        [...session.turns].map(({ idx }) => idx).sort((left, right) => left - right),
      )
    })

    it('rejects rather than inventing a session that does not exist', async () => {
      const { repository } = await setup()
      await expect(repository.getSession('00000000-0000-4000-8000-0000000000ff')).rejects.toThrow()
    })

    /** Detection compares a signal's confidence against its baseline. */
    it('returns a finite baseline for every signal kind', async () => {
      const { repository, sessionId } = await setup()
      const session = await repository.getSession(sessionId)
      const baselines = await repository.getBaselines(session, new Date('2020-01-01T00:00:00.000Z'))
      for (const kind of SignalKindSchema.options) {
        expect(Number.isFinite(baselines[kind])).toBe(true)
      }
    })

    it('reads an incident by id', async () => {
      const { repository, incidentId, orgId } = await setup()
      const incident: IncidentRecord = await repository.getIncident(incidentId)
      expect(incident.id).toBe(incidentId)
      expect(incident.orgId).toBe(orgId)
    })

    it('rejects rather than inventing an incident that does not exist', async () => {
      const { repository } = await setup()
      await expect(repository.getIncident('00000000-0000-4000-8000-0000000000ff')).rejects.toThrow()
    })

    it('lists the organisation’s incidents', async () => {
      const { repository, orgId, incidentId } = await setup()
      const incidents = await repository.listIncidents(orgId)
      expect(incidents.map(({ id }) => id)).toContain(incidentId)
    })

    it('returns an empty list for an organisation with no incidents', async () => {
      const { repository, emptyOrgId } = await setup()
      expect(await repository.listIncidents(emptyOrgId)).toEqual([])
    })

    it('honours the requested page size', async () => {
      const { repository, orgId } = await setup()
      expect((await repository.listIncidents(orgId, { limit: 1 })).length).toBeLessThanOrEqual(1)
    })

    it('confirms membership for an incident in the organisation', async () => {
      const { repository, orgId, incidentId } = await setup()
      expect(await repository.incidentInOrg(orgId, incidentId)).toBe(true)
    })

    it('denies membership across organisations', async () => {
      const { repository, emptyOrgId, incidentId } = await setup()
      expect(await repository.incidentInOrg(emptyOrgId, incidentId)).toBe(false)
    })

    it('denies membership for an incident that does not exist', async () => {
      const { repository, orgId } = await setup()
      expect(await repository.incidentInOrg(orgId, '00000000-0000-4000-8000-0000000000ff')).toBe(
        false,
      )
    })

    it('finds an incident by its cluster key and refuses a foreign agent', async () => {
      const { repository, agentId, incidentId } = await setup()
      const incident = await repository.getIncident(incidentId)
      expect((await repository.findIncident(agentId, incident.key))?.id).toBe(incidentId)
      expect(
        await repository.findIncident('00000000-0000-4000-8000-0000000000ff', incident.key),
      ).toBeNull()
    })

    it('applies a state transition only from the expected state', async () => {
      const { repository, incidentId } = await setup()
      const before = await repository.getIncident(incidentId)
      const updated = await repository.updateIncident(incidentId, before.state, {
        stateReason: 'contract-note',
      })
      expect(updated.stateReason).toBe('contract-note')
      // Compare-and-set: a stale expected state must not silently overwrite.
      await expect(
        repository.updateIncident(incidentId, 'CONFIRMED', { stateReason: 'stale' }),
      ).rejects.toThrow()
      expect((await repository.getIncident(incidentId)).stateReason).toBe('contract-note')
    })

    /** A split moves one assertion out of a clustered incident into its own. */
    it('carries the verdict onto a split incident', async () => {
      const { repository, incidentId } = await setup()
      const before = await repository.getIncident(incidentId)
      await repository.updateIncident(incidentId, before.state, {
        verdict: 'CONFIG_DEFECT',
        verdictConfidence: 0.9,
        verdictEvidence: { note: 'contract' },
      })
      const classified = await repository.getIncident(incidentId)

      const split = await repository.splitIncident(classified, 'split-key', 'split-identity')

      expect(split.id).not.toBe(incidentId)
      expect(split.state).toBe('CLASSIFIED')
      expect(split.verdict).toBe('CONFIG_DEFECT')
      expect(split.verdictConfidence).toBe(0.9)
      expect(split.verdictEvidence).toEqual({ note: 'contract' })
    })

    it('returns the existing incident rather than splitting twice', async () => {
      const { repository, incidentId } = await setup()
      const classified = await repository.getIncident(incidentId)
      const first = await repository.splitIncident(classified, 'split-key', 'split-identity')
      const again = await repository.splitIncident(classified, 'split-key', 'split-identity')
      expect(again.id).toBe(first.id)
    })

    /** The positive suite is what proves a fix does not regress anything else. */
    it('promotes an assertion into the agent’s positive suite', async () => {
      const { repository, agentId, incidentId, sessionId } = await setup()
      const incident = await repository.getIncident(incidentId)
      const assertion = await repository.saveAssertion({
        incident,
        definition: {
          kind: 'TOOL_ARG_EQUALS',
          tool: 'export_records',
          arg: 'filters',
          expected: { $ref: 'session.viewFilters' },
        },
        identity: 'c'.repeat(64),
        sourceSessionId: sessionId,
        polarity: 'negative',
      })
      expect(await repository.listPositiveAssertions(agentId)).toHaveLength(0)

      const promoted = await repository.promoteAssertion(assertion.id)

      expect(promoted.polarity).toBe('positive')
      expect((await repository.listPositiveAssertions(agentId)).map(({ id }) => id)).toContain(
        assertion.id,
      )
    })

    it('counts only in-flight incidents for an agent', async () => {
      const { repository, agentId } = await setup()
      const count = await repository.countInFlight(agentId)
      expect(Number.isInteger(count)).toBe(true)
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('reports a finite silent-failure rate for a window with no data', async () => {
      const { repository, emptyOrgId } = await setup()
      const rate = await repository.silentFailureRate(
        emptyOrgId,
        new Date('2020-01-01T00:00:00.000Z'),
        new Date('2020-01-02T00:00:00.000Z'),
      )
      expect(Number.isFinite(rate)).toBe(true)
    })

    it('reports finite gate precision even with nothing to measure', async () => {
      const { repository, emptyOrgId } = await setup()
      const { precision, n } = await repository.gatePrecision(emptyOrgId)
      expect(Number.isFinite(precision)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
    })

    it('returns no outcomes for an organisation that has none', async () => {
      const { repository, emptyOrgId } = await setup()
      expect(await repository.listOutcomes(emptyOrgId)).toEqual([])
    })

    it('has no pending outcome before one is applied', async () => {
      const { repository, sessionId } = await setup()
      const session = await repository.getSession(sessionId)
      expect(await repository.findPendingOutcome(session)).toBeNull()
    })

    it('reports no handoff before one is saved, then returns what was saved', async () => {
      const { repository, incidentId } = await setup()
      expect(await repository.getHandoff(incidentId)).toBeNull()
      const payload = handoffPayload()
      await repository.saveHandoff({ incidentId, payload, remoteThreadId: null })
      expect((await repository.getHandoff(incidentId))?.incidentId).toBe(incidentId)
    })

    it('saves a handoff idempotently', async () => {
      const { repository, incidentId } = await setup()
      const payload = handoffPayload()
      await repository.saveHandoff({ incidentId, payload, remoteThreadId: null })
      await expect(
        repository.saveHandoff({ incidentId, payload, remoteThreadId: null }),
      ).resolves.toBeUndefined()
    })

    it('reports the agent’s writable-config policy', async () => {
      const { repository, agentId } = await setup()
      const policy = await repository.getWritableConfigPolicy(agentId)
      expect(Array.isArray(policy.writablePaths)).toBe(true)
      expect(Number.isFinite(policy.maxDiffBytes)).toBe(true)
    })

    it('counts the signals recorded for a session', async () => {
      const { repository, sessionId } = await setup()
      const count = await repository.countSignals(sessionId)
      expect(Number.isInteger(count)).toBe(true)
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('reports no candidate diff before a candidate exists', async () => {
      const { repository, incidentId } = await setup()
      expect(await repository.getIncidentDiff(incidentId)).toBeNull()
    })

    it('reports no latest candidate before one is saved', async () => {
      const { repository, incidentId } = await setup()
      const incident = await repository.getIncident(incidentId)
      expect(await repository.latestCandidate(incidentId, incident.attempt)).toBeNull()
    })

    it('reports no outcome for an incident before one is created', async () => {
      const { repository, incidentId } = await setup()
      expect(await repository.getOutcomeForIncident(incidentId)).toBeNull()
    })

    it('produces a snapshot whose incident matches the incident read directly', async () => {
      const { repository, incidentId } = await setup()
      const snapshot = await repository.getSnapshot(incidentId)
      const incident = await repository.getIncident(incidentId)
      expect(snapshot.incident.id).toBe(incident.id)
      expect(snapshot.incident.state).toBe(incident.state)
      expect(Array.isArray(snapshot.positiveSuite)).toBe(true)
    })
  })
}
