import { randomUUID } from "node:crypto";

import {
  AssertionSchema,
  CandidateSchema,
  OutcomeSchema,
  RunSchema,
} from "@wingman/schema";

import type { IncidentRecord } from "../domain.js";
import { PIPELINE_POLICY } from "../policy.js";
import type { PipelineRepository } from "../repository.js";
import { assertTransition } from "../state.js";
import type { ReplayDatabase } from "./database.js";
import {
  defined,
  required,
  unique,
  uniqueEvidence,
} from "./repository-helpers.js";
import type { ReplayReadRepository } from "./repository-read.js";

export type ReplayWriteRepository = Pick<
  PipelineRepository,
  | "createOrJoinIncident"
  | "updateIncident"
  | "splitIncident"
  | "saveAssertion"
  | "saveRun"
  | "saveCandidate"
  | "updateCandidate"
  | "createOutcome"
  | "updateOutcome"
  | "expireIncidents"
  | "retainEvents"
  | "saveHandoff"
>;

export function createReplayWriteRepository(
  database: ReplayDatabase,
  read: ReplayReadRepository,
): ReplayWriteRepository {
  return {
    async createOrJoinIncident(input) {
      const existing = await read.findIncident(
        input.session.agentId,
        input.key,
      );
      if (existing === null) {
        const timestamp = input.session.endedAt ?? input.session.startedAt;
        const incident: IncidentRecord = {
          id: randomUUID(),
          orgId: input.session.orgId,
          agentId: input.session.agentId,
          key: input.key,
          fingerprint: input.fingerprint,
          signalKind: input.signalKind,
          title: input.title,
          state: "OPEN",
          stateReason: null,
          attempt: 1,
          verdict: null,
          verdictConfidence: null,
          verdictEvidence: null,
          assertionId: null,
          userHashes: [input.session.userHash],
          sessionIds: [input.session.id],
          evidenceExcerpts: structuredClone(input.evidence),
          firstSeen: timestamp,
          lastSeen: timestamp,
          expiresAt: input.expiresAt,
        };
        database.incidents.set(incident.id, incident);
        return structuredClone(incident);
      }
      const stored = required(database.incidents, existing.id, "Incident");
      stored.userHashes = unique([
        ...stored.userHashes,
        input.session.userHash,
      ]);
      stored.sessionIds = unique([...stored.sessionIds, input.session.id]);
      stored.evidenceExcerpts = uniqueEvidence([
        ...stored.evidenceExcerpts,
        ...input.evidence,
      ]);
      stored.lastSeen = input.session.endedAt ?? input.session.startedAt;
      stored.expiresAt = input.expiresAt;
      if (
        stored.state === "OPEN" &&
        stored.sessionIds.length >= PIPELINE_POLICY.clusterMinimumSessions
      )
        stored.state = "CLUSTERED";
      return structuredClone(stored);
    },
    updateIncident(id, expectedState, patch) {
      const incident = required(database.incidents, id, "Incident");
      if (incident.state !== expectedState)
        throw new Error(`Incident state changed: ${incident.state}`);
      if (patch.state !== undefined && patch.state !== expectedState)
        assertTransition(expectedState, patch.state);
      Object.assign(incident, defined(patch));
      return Promise.resolve(structuredClone(incident));
    },
    async splitIncident(incident, key, identity) {
      const existing = await read.findIncident(incident.agentId, key);
      if (existing !== null) return existing;
      const split: IncidentRecord = {
        ...structuredClone(incident),
        id: randomUUID(),
        key,
        state: "CLASSIFIED",
        stateReason: `ASSERTION_SPLIT:${identity}`,
        assertionId: null,
      };
      database.incidents.set(split.id, split);
      return structuredClone(split);
    },
    saveAssertion(input) {
      const existing = [...database.assertions.values()].find(
        ({ agentId, identity }) =>
          agentId === input.incident.agentId && identity === input.identity,
      );
      if (existing !== undefined)
        return Promise.resolve(structuredClone(existing));
      const assertion = AssertionSchema.parse({
        id: randomUUID(),
        incidentId: input.incident.id,
        agentId: input.incident.agentId,
        definition: input.definition,
        identity: input.identity,
        sourceSessionId: input.sourceSessionId,
        polarity: input.polarity,
        createdAt: new Date().toISOString(),
      });
      database.assertions.set(assertion.id, assertion);
      return Promise.resolve(structuredClone(assertion));
    },
    saveRun(input) {
      const key = `${input.assertionId}:${input.phase}:${input.attempt}:${input.candidateId ?? "base"}`;
      const existing = database.runs.get(key);
      if (existing !== undefined)
        return Promise.resolve(structuredClone(existing));
      const run = RunSchema.parse({
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      });
      database.runs.set(key, run);
      return Promise.resolve(structuredClone(run));
    },
    saveCandidate(input) {
      const existing = [...database.candidates.values()].find(
        ({ incidentId, attempt, iteration }) =>
          incidentId === input.incidentId &&
          attempt === input.attempt &&
          iteration === input.iteration,
      );
      if (existing !== undefined)
        return Promise.resolve(structuredClone(existing));
      const candidate = CandidateSchema.parse({
        id: randomUUID(),
        ...input,
        newVersionId: null,
        state: "PROPOSED",
        rejectedReason: null,
        createdAt: new Date().toISOString(),
      });
      database.candidates.set(candidate.id, candidate);
      return Promise.resolve(structuredClone(candidate));
    },
    updateCandidate(id, patch) {
      const updated = CandidateSchema.parse({
        ...required(database.candidates, id, "Candidate"),
        ...defined(patch),
      });
      database.candidates.set(id, updated);
      return Promise.resolve(structuredClone(updated));
    },
    createOutcome(input) {
      const existing = [...database.outcomes.values()].find(
        ({ incidentId, candidateId, scope }) =>
          incidentId === input.incidentId &&
          candidateId === input.candidateId &&
          scope === input.scope,
      );
      if (existing !== undefined)
        return Promise.resolve(structuredClone(existing));
      const { versionId, ...fields } = input;
      const outcome = OutcomeSchema.parse({
        id: randomUUID(),
        ...fields,
        appliedVersionId: versionId,
        status: "PENDING",
        confirmedAt: null,
        revertedAt: null,
        createdAt: new Date().toISOString(),
      });
      database.outcomes.set(outcome.id, outcome);
      return Promise.resolve(structuredClone(outcome));
    },
    updateOutcome(id, patch) {
      const updated = OutcomeSchema.parse({
        ...required(database.outcomes, id, "Outcome"),
        ...defined(patch),
      });
      database.outcomes.set(id, updated);
      return Promise.resolve(structuredClone(updated));
    },
    expireIncidents(now) {
      let count = 0;
      for (const incident of database.incidents.values()) {
        const terminal = ["CONFIRMED", "DISCARDED", "EXPIRED"].includes(
          incident.state,
        );
        if (
          incident.expiresAt !== null &&
          incident.expiresAt < now.toISOString() &&
          !terminal
        ) {
          incident.state = "EXPIRED";
          incident.stateReason = "NO_RECURRENCE_14D";
          count += 1;
        }
      }
      return Promise.resolve(count);
    },
    retainEvents(before) {
      const ids = [...database.sessions.values()]
        .filter(({ startedAt }) => startedAt < before.toISOString())
        .map(({ id }) => id);
      for (const id of ids) database.sessions.delete(id);
      const removed = new Set(ids);
      const kept = database.signals.filter(
        ({ sessionId }) => !removed.has(sessionId),
      );
      database.signals.splice(0, database.signals.length, ...kept);
      return Promise.resolve(ids.length);
    },
    saveHandoff(record) {
      if (!database.handoffs.has(record.incidentId))
        database.handoffs.set(record.incidentId, structuredClone(record));
      return Promise.resolve();
    },
  };
}
