import type { Assertion, Candidate, IncidentState, Outcome } from '@wingman/schema'

import type { PipelineSnapshot } from '../domain.js'
import { sessionFingerprint } from '../cluster/index.js'
import type { PipelineRepository } from '../repository.js'
import type { ReplayDatabase } from './database.js'
import { QUERY_LIMITS } from '../store/query-limits.js'
import { rates, required } from './repository-helpers.js'

export type ReplayReadRepository = Pick<
  PipelineRepository,
  | 'getSession'
  | 'getBaselines'
  | 'hasMatchingRestart'
  | 'countInFlight'
  | 'getIncident'
  | 'findIncident'
  | 'getAssertion'
  | 'listPositiveAssertions'
  | 'getBaseVersionId'
  | 'getCandidate'
  | 'latestCandidate'
  | 'getOutcomeForIncident'
  | 'findPendingOutcome'
  | 'getSnapshot'
  | 'listIncidents'
  | 'incidentInOrg'
  | 'listOutcomes'
  | 'silentFailureRate'
  | 'gatePrecision'
  | 'getHandoff'
  | 'getWritableConfigPolicy'
  | 'countSignals'
  | 'getIncidentDiff'
>

const IN_FLIGHT: IncidentState[] = [
  'OPEN',
  'CLUSTERED',
  'CLASSIFIED',
  'ASSERTED',
  'CANDIDATE',
  'APPLIED',
]

export function createReplayReadRepository(database: ReplayDatabase): ReplayReadRepository {
  async function getSession(sessionId: string) {
    return structuredClone(required(database.sessions, sessionId, 'Session'))
  }

  async function getIncident(id: string) {
    return structuredClone(required(database.incidents, id, 'Incident'))
  }

  function getAssertion(id: string): Promise<Assertion> {
    return Promise.resolve(structuredClone(required(database.assertions, id, 'Assertion')))
  }

  function getCandidate(id: string): Promise<Candidate> {
    return Promise.resolve(structuredClone(required(database.candidates, id, 'Candidate')))
  }

  function latestCandidate(incidentId: string, attempt: number): Promise<Candidate | null> {
    const candidates = [...database.candidates.values()]
      .filter((candidate) => candidate.incidentId === incidentId && candidate.attempt === attempt)
      .sort((left, right) => right.iteration - left.iteration)
    return Promise.resolve(candidates[0] === undefined ? null : structuredClone(candidates[0]))
  }

  function getOutcomeForIncident(incidentId: string): Promise<Outcome | null> {
    const outcome = [...database.outcomes.values()]
      .filter(({ incidentId: id }) => id === incidentId)
      .at(-1)
    return Promise.resolve(outcome === undefined ? null : structuredClone(outcome))
  }

  async function getSnapshot(incidentId: string): Promise<PipelineSnapshot> {
    const incident = await getIncident(incidentId)
    const runs = [...database.runs.values()].filter(
      (run) => run.incidentId === incidentId && run.attempt === incident.attempt,
    )
    return {
      incident,
      assertion: incident.assertionId === null ? null : await getAssertion(incident.assertionId),
      before: runs.find(({ phase }) => phase === 'VERIFY_FAIL') ?? null,
      candidate: await latestCandidate(incidentId, incident.attempt),
      after: [...runs].reverse().find(({ phase }) => phase === 'VERIFY_PASS') ?? null,
      positiveSuite: runs.filter(({ phase }) => phase === 'POSITIVE_SUITE'),
      outcome: await getOutcomeForIncident(incidentId),
      handoff: structuredClone(database.handoffs.get(incidentId) ?? null),
    }
  }

  return {
    getSession,
    async getBaselines(session, since) {
      const prior = [...database.sessions.values()].filter(
        (candidate) =>
          candidate.agentId === session.agentId &&
          candidate.startedAt >= since.toISOString() &&
          candidate.startedAt < session.startedAt,
      )
      const user = prior.filter(({ userHash }) => userHash === session.userHash)
      return rates(
        (user.length === 0 ? prior : user).map(({ id }) => id),
        database.signals,
      )
    },
    async hasMatchingRestart(session, withinMinutes) {
      if (session.taskFingerprint === null) return false
      const cutoff = new Date(
        new Date(session.startedAt).getTime() - withinMinutes * 60_000,
      ).toISOString()
      return [...database.sessions.values()].some(
        (candidate) =>
          candidate.id !== session.id &&
          candidate.agentId === session.agentId &&
          candidate.userHash === session.userHash &&
          candidate.taskFingerprint === session.taskFingerprint &&
          candidate.startedAt >= cutoff &&
          candidate.startedAt < session.startedAt &&
          candidate.generationCancelled === true,
      )
    },
    countInFlight(agentId) {
      return Promise.resolve(
        [...database.incidents.values()].filter(
          (incident) => incident.agentId === agentId && IN_FLIGHT.includes(incident.state),
        ).length,
      )
    },
    getIncident,
    findIncident(agentId, key) {
      const incident = [...database.incidents.values()].find(
        (candidate) => candidate.agentId === agentId && candidate.key === key,
      )
      return Promise.resolve(incident === undefined ? null : structuredClone(incident))
    },
    getAssertion,
    listPositiveAssertions(agentId) {
      return Promise.resolve(
        structuredClone(
          [...database.assertions.values()].filter(
            (assertion) => assertion.agentId === agentId && assertion.polarity === 'positive',
          ),
        ),
      )
    },
    async getBaseVersionId(agentId) {
      return required(database.baseVersionIds, agentId, 'Base version')
    },
    getCandidate,
    latestCandidate,
    getOutcomeForIncident,
    async findPendingOutcome(session) {
      const outcome = [...database.outcomes.values()].find((candidate) => {
        if (candidate.status !== 'PENDING' || !candidate.appliedTo.includes(session.userHash))
          return false
        // Scoped to the agent as well as the fingerprint: user hashes are organisation-scoped, so a.
        const incident = database.incidents.get(candidate.incidentId)
        return (
          incident?.agentId === session.agentId &&
          incident.fingerprint === sessionFingerprint(session)
        )
      })
      return outcome === undefined ? null : structuredClone(outcome)
    },
    getSnapshot,
    listIncidents(orgId, options) {
      const incidents = [...database.incidents.values()]
        .filter(({ orgId: id }) => id === orgId)
        .sort((left, right) => right.lastSeen.localeCompare(left.lastSeen))
        .slice(0, options?.limit ?? QUERY_LIMITS.listPage)
      return Promise.resolve(structuredClone(incidents))
    },
    incidentInOrg(orgId, incidentId) {
      return Promise.resolve(database.incidents.get(incidentId)?.orgId === orgId)
    },
    listOutcomes(orgId) {
      const ids = new Set(
        [...database.incidents.values()]
          .filter(({ orgId: id }) => id === orgId)
          .map(({ id }) => id),
      )
      return Promise.resolve(
        structuredClone(
          [...database.outcomes.values()].filter(({ incidentId }) => ids.has(incidentId)),
        ),
      )
    },
    silentFailureRate(orgId, start, end) {
      const sessions = [...database.sessions.values()].filter(
        (session) =>
          session.orgId === orgId &&
          session.startedAt >= start.toISOString() &&
          session.startedAt < end.toISOString(),
      )
      if (sessions.length === 0) return Promise.resolve(0)
      const ids = new Set(sessions.map(({ id }) => id))
      const signaled = new Set(
        database.signals
          .filter(({ sessionId }) => ids.has(sessionId))
          .map(({ sessionId }) => sessionId),
      )
      return Promise.resolve(signaled.size / sessions.length)
    },
    async gatePrecision(orgId) {
      const incidents = [...database.incidents.values()].filter(
        (incident) => incident.orgId === orgId && incident.assertionId !== null,
      )
      const latest = incidents.flatMap((incident) =>
        [...database.runs.values()].filter(
          (run) =>
            run.incidentId === incident.id &&
            run.attempt === incident.attempt &&
            run.phase === 'VERIFY_FAIL',
        ),
      )
      const failures = latest.filter(({ passCount }) => passCount <= 1).length
      return {
        precision: latest.length === 0 ? 0 : failures / latest.length,
        n: latest.length,
      }
    },
    getHandoff(incidentId) {
      return Promise.resolve(structuredClone(database.handoffs.get(incidentId) ?? null))
    },
    async getWritableConfigPolicy(agentId) {
      return structuredClone(required(database.writablePolicies, agentId, 'Writable policy'))
    },
    countSignals(sessionId) {
      return Promise.resolve(
        database.signals.filter(({ sessionId: id }) => id === sessionId).length,
      )
    },
    async getIncidentDiff(incidentId) {
      const incident = await getIncident(incidentId)
      return (await latestCandidate(incidentId, incident.attempt))?.diff ?? null
    },
  }
}
