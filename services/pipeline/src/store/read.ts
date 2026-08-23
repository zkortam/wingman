import type { ServiceClient } from "@outcome/db";

import type { HandoffRecord, PipelineSnapshot } from "../domain.js";
import type { PipelineRepository } from "../repository.js";
import { sessionFingerprint } from "../cluster/index.js";
import { createHistoryStore } from "./history.js";
import {
  mapAssertion,
  mapCandidate,
  mapIncident,
  mapOutcome,
  mapRun,
  mapSession,
  type Row,
} from "./mappers.js";
import { createMetricsStore } from "./metrics.js";
import { rows, single } from "./read-helpers.js";

type ReadStore = Pick<
  PipelineRepository,
  | "getSession"
  | "getBaselines"
  | "hasMatchingRestart"
  | "countInFlight"
  | "getIncident"
  | "findIncident"
  | "getAssertion"
  | "listPositiveAssertions"
  | "getBaseVersionId"
  | "getCandidate"
  | "latestCandidate"
  | "getOutcomeForIncident"
  | "findPendingOutcome"
  | "getSnapshot"
  | "listSnapshots"
  | "listOutcomes"
  | "silentFailureRate"
  | "gatePrecision"
  | "getHandoff"
  | "getWritableConfigPolicy"
  | "countSignals"
  | "getIncidentDiff"
>;

export function createReadStore(
  client: ServiceClient,
  handoffs: Map<string, HandoffRecord>,
): ReadStore {
  async function getSession(sessionId: string) {
    const session = await single<Row<"sessions">>(
      client.from("sessions").select("*").eq("id", sessionId).single(),
    );
    const turns = await rows<Row<"turns">>(
      client.from("turns").select("*").eq("session_id", sessionId).order("idx"),
    );
    return mapSession(session, turns);
  }

  async function getIncident(id: string) {
    return mapIncident(
      await single<Row<"incidents">>(
        client.from("incidents").select("*").eq("id", id).single(),
      ),
    );
  }

  async function getSnapshot(incidentId: string): Promise<PipelineSnapshot> {
    const incident = await getIncident(incidentId);
    const assertion =
      incident.assertionId === null
        ? null
        : await readAssertion(incident.assertionId);
    const runRows = await rows<Row<"runs">>(
      client
        .from("runs")
        .select("*")
        .eq("incident_id", incidentId)
        .eq("attempt", incident.attempt)
        .order("created_at"),
    );
    const runs = runRows.map(mapRun);
    const candidateRows = await rows<Row<"candidates">>(
      client
        .from("candidates")
        .select("*")
        .eq("incident_id", incidentId)
        .eq("attempt", incident.attempt)
        .order("iteration"),
    );
    const outcomeRows = await rows<Row<"outcomes">>(
      client
        .from("outcomes")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at"),
    );
    return {
      incident,
      assertion,
      before: runs.find(({ phase }) => phase === "VERIFY_FAIL") ?? null,
      candidate:
        candidateRows.at(-1) === undefined
          ? null
          : mapCandidate(candidateRows.at(-1)!),
      after:
        [...runs].reverse().find(({ phase }) => phase === "VERIFY_PASS") ??
        null,
      positiveSuite: runs.filter(({ phase }) => phase === "POSITIVE_SUITE"),
      outcome:
        outcomeRows.at(-1) === undefined
          ? null
          : mapOutcome(outcomeRows.at(-1)!),
      handoff: handoffs.get(incidentId) ?? null,
    };
  }

  async function readAssertion(id: string) {
    return mapAssertion(
      await single<Row<"assertions">>(
        client.from("assertions").select("*").eq("id", id).single(),
      ),
    );
  }

  async function latestCandidate(incidentId: string, attempt: number) {
    const result = await client
      .from("candidates")
      .select("*")
      .eq("incident_id", incidentId)
      .eq("attempt", attempt)
      .order("iteration", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data === null
      ? null
      : mapCandidate(result.data as Row<"candidates">);
  }

  return {
    ...createHistoryStore(client),
    ...createMetricsStore(client),
    getSession,
    getIncident,
    async findIncident(agentId, key) {
      const result = await client
        .from("incidents")
        .select("*")
        .eq("agent_id", agentId)
        .eq("key", key)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data === null
        ? null
        : mapIncident(result.data as Row<"incidents">);
    },
    getAssertion: readAssertion,
    async listPositiveAssertions(agentId) {
      return (
        await rows<Row<"assertions">>(
          client
            .from("assertions")
            .select("*")
            .eq("agent_id", agentId)
            .eq("polarity", "positive"),
        )
      ).map(mapAssertion);
    },
    async getBaseVersionId(agentId) {
      const version = await single<Pick<Row<"config_versions">, "id">>(
        client
          .from("config_versions")
          .select("id")
          .eq("agent_id", agentId)
          .order("version")
          .limit(1)
          .single(),
      );
      return version.id;
    },
    async getCandidate(id) {
      return mapCandidate(
        await single<Row<"candidates">>(
          client.from("candidates").select("*").eq("id", id).single(),
        ),
      );
    },
    latestCandidate,
    async getOutcomeForIncident(incidentId) {
      const result = await client
        .from("outcomes")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data === null
        ? null
        : mapOutcome(result.data as Row<"outcomes">);
    },
    async findPendingOutcome(session) {
      const outcomes = await rows<Row<"outcomes">>(
        client
          .from("outcomes")
          .select("*")
          .eq("status", "PENDING")
          .contains("applied_to", [session.userHash]),
      );
      for (const outcome of outcomes) {
        const incident = await getIncident(outcome.incident_id);
        if (incident.fingerprint === sessionFingerprint(session))
          return mapOutcome(outcome);
      }
      return null;
    },
    getSnapshot,
    async listSnapshots(orgId) {
      const incidents = await rows<Pick<Row<"incidents">, "id">>(
        client.from("incidents").select("id").eq("org_id", orgId),
      );
      return Promise.all(incidents.map(({ id }) => getSnapshot(id)));
    },
    async listOutcomes(orgId) {
      const incidents = await rows<Pick<Row<"incidents">, "id">>(
        client.from("incidents").select("id").eq("org_id", orgId),
      );
      if (incidents.length === 0) return [];
      return (
        await rows<Row<"outcomes">>(
          client
            .from("outcomes")
            .select("*")
            .in(
              "incident_id",
              incidents.map(({ id }) => id),
            )
            .order("created_at"),
        )
      ).map(mapOutcome);
    },
    getHandoff(incidentId) {
      return Promise.resolve(handoffs.get(incidentId) ?? null);
    },
    async getWritableConfigPolicy(agentId) {
      const row = await single<
        Pick<
          Row<"agents">,
          "codex_endpoint" | "max_diff_bytes" | "writable_paths"
        >
      >(
        client
          .from("agents")
          .select("codex_endpoint,max_diff_bytes,writable_paths")
          .eq("id", agentId)
          .single(),
      );
      return {
        codexEndpoint: row.codex_endpoint,
        maxDiffBytes: row.max_diff_bytes,
        writablePaths: row.writable_paths,
      };
    },
    async countSignals(sessionId) {
      const { count, error } = await client
        .from("signals")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);
      if (error) throw error;
      return count ?? 0;
    },
    async getIncidentDiff(incidentId) {
      const incident = await getIncident(incidentId);
      const candidate = await latestCandidate(incidentId, incident.attempt);
      return candidate?.diff ?? null;
    },
  };
}
