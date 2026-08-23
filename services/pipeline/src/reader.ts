import type { IncidentDetail, PipelineReader } from "@wingman/schema";

import type { PipelineRepository } from "./repository.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

export function createPipelineReader(
  repository: PipelineRepository,
  now = () => new Date(),
): PipelineReader {
  return {
    async listIncidents(orgId) {
      const snapshots = await repository.listSnapshots(orgId);
      return snapshots.map(({ incident }) => ({
        id: incident.id,
        title: incident.title,
        affectedUsers: incident.userHashes.length,
        sessionCount: incident.sessionIds.length,
        firstSeen: incident.firstSeen,
        lastSeen: incident.lastSeen,
        state: incident.state,
        stateReason: incident.stateReason,
        verdict: incident.verdict,
      }));
    },
    async getIncident(id) {
      return toDetail(await repository.getSnapshot(id));
    },
    listOutcomes(orgId) {
      return repository.listOutcomes(orgId);
    },
    async silentFailureRate(orgId) {
      const current = now();
      const thisWeekStart = new Date(current.getTime() - WEEK_MS);
      const lastWeekStart = new Date(current.getTime() - WEEK_MS * 2);
      const [thisWeek, lastWeek] = await Promise.all([
        repository.silentFailureRate(orgId, thisWeekStart, current),
        repository.silentFailureRate(orgId, lastWeekStart, thisWeekStart),
      ]);
      return { thisWeek, lastWeek };
    },
    gatePrecision(orgId) {
      return repository.gatePrecision(orgId);
    },
  };
}

function toDetail(
  snapshot: Awaited<ReturnType<PipelineRepository["getSnapshot"]>>,
): IncidentDetail {
  const { incident } = snapshot;
  return {
    id: incident.id,
    title: incident.title,
    affectedUsers: incident.userHashes.length,
    sessionCount: incident.sessionIds.length,
    firstSeen: incident.firstSeen,
    lastSeen: incident.lastSeen,
    state: incident.state,
    stateReason: incident.stateReason,
    verdict: incident.verdict,
    attempt: incident.attempt,
    evidence: incident.evidenceExcerpts,
    verdictConfidence: incident.verdictConfidence,
    verdictEvidence: incident.verdictEvidence,
    assertion: snapshot.assertion,
    before: snapshot.before,
    candidate: snapshot.candidate,
    after: snapshot.after,
    positiveSuite: snapshot.positiveSuite,
    outcome: snapshot.outcome,
    handoff: snapshot.handoff?.payload ?? null,
  };
}
