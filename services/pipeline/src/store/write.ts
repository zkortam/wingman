import type { ServiceClient } from "@wingman/db";
import type { Json } from "@wingman/db";

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
  read: Pick<PipelineRepository, "findIncident" | "getIncident">,
): WriteStore {
  return {
    ...createMaintenanceStore(client),
    async createOrJoinIncident(input) {
      const row = await single<Row<"incidents">>(
        client.rpc("wingman_join_incident", {
          p_org_id: input.session.orgId,
          p_agent_id: input.session.agentId,
          p_key: input.key,
          p_fingerprint: input.fingerprint,
          p_signal_kind: input.signalKind,
          p_title: input.title,
          p_user_hash: input.session.userHash,
          p_session_id: input.session.id,
          p_evidence: input.evidence as Json,
          p_seen_at: input.session.endedAt ?? input.session.startedAt,
          p_expires_at: input.expiresAt,
          p_cluster_minimum: PIPELINE_POLICY.clusterMinimumSessions,
        }).single(),
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

    async saveHandoff(record) {
      const { error } = await client.from('pipeline_handoffs').upsert({
        incident_id: record.incidentId,
        payload: record.payload,
        remote_thread_id: record.remoteThreadId,
      }, { onConflict: 'incident_id', ignoreDuplicates: true })
      if (error) throw error
    },
  };
}
