import type { ServiceClient } from "@wingman/db";
import type { Json } from "@wingman/db";

import type { HandoffRecord } from "../domain.js";
import { PIPELINE_POLICY } from "../policy.js";
import type { PipelineRepository } from "../repository.js";
import { assertTransition } from "../state.js";
import { createMaintenanceStore } from "./maintenance.js";
import {
  mapAssertion,
  mapCandidate,
  mapIncident,
  mapOutcome,
  mapRun,
  type Row,
} from "./mappers.js";
import { single } from "./read-helpers.js";
import {
  findRun,
  toCandidateUpdate,
  toIncidentUpdate,
  toOutcomeUpdate,
  unique,
  uniqueEvidence,
} from "./write-helpers.js";

type WriteStore = Pick<
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

export function createWriteStore(
  client: ServiceClient,
  handoffs: Map<string, HandoffRecord>,
  read: Pick<PipelineRepository, "findIncident" | "getIncident">,
): WriteStore {
  return {
    ...createMaintenanceStore(client),
    async createOrJoinIncident(input) {
      const existing = await read.findIncident(
        input.session.agentId,
        input.key,
      );
      if (existing === null) {
        const row = await single<Row<"incidents">>(
          client
            .from("incidents")
            .insert({
              org_id: input.session.orgId,
              agent_id: input.session.agentId,
              key: input.key,
              fingerprint: input.fingerprint,
              signal_kind: input.signalKind,
              title: input.title,
              state: "OPEN",
              user_hashes: [input.session.userHash],
              session_ids: [input.session.id],
              evidence_excerpts: input.evidence,
              expires_at: input.expiresAt,
            })
            .select("*")
            .single(),
        );
        return mapIncident(row);
      }

      const userHashes = unique([
        ...existing.userHashes,
        input.session.userHash,
      ]);
      const sessionIds = unique([...existing.sessionIds, input.session.id]);
      const evidence = uniqueEvidence([
        ...existing.evidenceExcerpts,
        ...input.evidence,
      ]);
      const shouldCluster =
        existing.state === "OPEN" &&
        sessionIds.length >= PIPELINE_POLICY.clusterMinimumSessions;
      const row = await single<Row<"incidents">>(
        client
          .from("incidents")
          .update({
            user_hashes: userHashes,
            session_ids: sessionIds,
            evidence_excerpts: evidence,
            last_seen: input.session.endedAt ?? input.session.startedAt,
            expires_at: input.expiresAt,
            state: shouldCluster ? "CLUSTERED" : existing.state,
          })
          .eq("id", existing.id)
          .select("*")
          .single(),
      );
      return mapIncident(row);
    },

    async updateIncident(id, expectedState, patch) {
      if (patch.state !== undefined && patch.state !== expectedState)
        assertTransition(expectedState, patch.state);
      const row = await single<Row<"incidents">>(
        client
          .from("incidents")
          .update(toIncidentUpdate(patch))
          .eq("id", id)
          .eq("state", expectedState)
          .select("*")
          .single(),
      );
      return mapIncident(row);
    },

    async splitIncident(incident, key, identity) {
      const existing = await read.findIncident(incident.agentId, key);
      if (existing !== null) return existing;
      const row = await single<Row<"incidents">>(
        client
          .from("incidents")
          .insert({
            org_id: incident.orgId,
            agent_id: incident.agentId,
            key,
            fingerprint: incident.fingerprint,
            signal_kind: incident.signalKind,
            title: incident.title,
            state: "CLASSIFIED",
            state_reason: `ASSERTION_SPLIT:${identity}`,
            user_hashes: incident.userHashes,
            session_ids: incident.sessionIds,
            evidence_excerpts: incident.evidenceExcerpts,
            expires_at: incident.expiresAt,
          })
          .select("*")
          .single(),
      );
      return mapIncident(row);
    },

    async saveAssertion(input) {
      const result = await client
        .from("assertions")
        .select("*")
        .eq("agent_id", input.incident.agentId)
        .eq("identity", input.identity)
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data !== null)
        return mapAssertion(result.data as Row<"assertions">);
      const { kind, ...params } = input.definition;
      const row = await single<Row<"assertions">>(
        client
          .from("assertions")
          .insert({
            incident_id: input.incident.id,
            agent_id: input.incident.agentId,
            kind,
            params: params as Json,
            identity: input.identity,
            source_session_id: input.sourceSessionId,
            polarity: input.polarity,
          })
          .select("*")
          .single(),
      );
      return mapAssertion(row);
    },

    async saveRun(input) {
      const existing = await findRun(client, input);
      if (existing !== null) return mapRun(existing);
      const row = await single<Row<"runs">>(
        client
          .from("runs")
          .insert({
            assertion_id: input.assertionId,
            incident_id: input.incidentId,
            phase: input.phase,
            attempt: input.attempt,
            config_version_id: input.configVersionId,
            candidate_id: input.candidateId,
            n: input.n,
            pass_count: input.passCount,
            results: input.results as Json,
            tool_executions: input.toolExecutions,
          })
          .select("*")
          .single(),
      );
      return mapRun(row);
    },

    async saveCandidate(input) {
      const result = await client
        .from("candidates")
        .select("*")
        .eq("incident_id", input.incidentId)
        .eq("attempt", input.attempt)
        .eq("iteration", input.iteration)
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data !== null)
        return mapCandidate(result.data as Row<"candidates">);
      const row = await single<Row<"candidates">>(
        client
          .from("candidates")
          .insert({
            incident_id: input.incidentId,
            diff: input.diff as Json,
            diff_bytes: input.diffBytes,
            base_version_id: input.baseVersionId,
            attempt: input.attempt,
            iteration: input.iteration,
          })
          .select("*")
          .single(),
      );
      return mapCandidate(row);
    },

    async updateCandidate(id, patch) {
      const row = await single<Row<"candidates">>(
        client
          .from("candidates")
          .update(toCandidateUpdate(patch))
          .eq("id", id)
          .select("*")
          .single(),
      );
      return mapCandidate(row);
    },

    async createOutcome(input) {
      const result = await client
        .from("outcomes")
        .select("*")
        .eq("incident_id", input.incidentId)
        .eq("candidate_id", input.candidateId)
        .eq("scope", input.scope)
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data !== null)
        return mapOutcome(result.data as Row<"outcomes">);
      const row = await single<Row<"outcomes">>(
        client
          .from("outcomes")
          .insert({
            incident_id: input.incidentId,
            candidate_id: input.candidateId,
            scope: input.scope,
            applied_to: input.appliedTo,
            applied_version_id: input.versionId,
            window_ends_at: input.windowEndsAt,
          })
          .select("*")
          .single(),
      );
      return mapOutcome(row);
    },

    async updateOutcome(id, patch) {
      const row = await single<Row<"outcomes">>(
        client
          .from("outcomes")
          .update(toOutcomeUpdate(patch))
          .eq("id", id)
          .select("*")
          .single(),
      );
      return mapOutcome(row);
    },

    saveHandoff(record) {
      handoffs.set(record.incidentId, record);
      return Promise.resolve();
    },
  };
}
