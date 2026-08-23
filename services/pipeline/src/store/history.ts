import type { ServiceClient } from "@outcome/db";
import { type SignalKind, SignalKindSchema } from "@outcome/schema";

import type { Baselines } from "../detect/index.js";
import type { PipelineRepository } from "../repository.js";
import type { Row } from "./mappers.js";
import { rows } from "./read-helpers.js";

type HistoryStore = Pick<
  PipelineRepository,
  "getBaselines" | "hasMatchingRestart" | "countInFlight"
>;

const SIGNAL_KINDS = SignalKindSchema.options;

export function createHistoryStore(client: ServiceClient): HistoryStore {
  return {
    async getBaselines(session, since): Promise<Baselines> {
      const userSessions = await rows<Pick<Row<"sessions">, "id">>(
        client
          .from("sessions")
          .select("id")
          .eq("agent_id", session.agentId)
          .eq("user_hash", session.userHash)
          .gte("started_at", since.toISOString())
          .lt("started_at", session.startedAt),
      );
      const cohortSessions = await rows<Pick<Row<"sessions">, "id">>(
        client
          .from("sessions")
          .select("id")
          .eq("agent_id", session.agentId)
          .gte("started_at", since.toISOString())
          .lt("started_at", session.startedAt),
      );
      const userRates = await signalRates(
        client,
        userSessions.map(({ id }) => id),
      );
      const cohortRates = await signalRates(
        client,
        cohortSessions.map(({ id }) => id),
      );
      return Object.fromEntries(
        SIGNAL_KINDS.map((kind) => [
          kind,
          userSessions.length === 0 ? cohortRates[kind] : userRates[kind],
        ]),
      ) as Baselines;
    },
    async hasMatchingRestart(session, withinMinutes) {
      if (session.taskFingerprint === null) return false;
      const earliest = new Date(
        new Date(session.startedAt).getTime() - withinMinutes * 60_000,
      ).toISOString();
      const candidates = await rows<Pick<Row<"sessions">, "context">>(
        client
          .from("sessions")
          .select("context")
          .eq("agent_id", session.agentId)
          .eq("user_hash", session.userHash)
          .eq("task_fingerprint", session.taskFingerprint)
          .gte("started_at", earliest)
          .lt("started_at", session.startedAt),
      );
      return candidates.some(({ context }) => {
        return (
          typeof context === "object" &&
          context !== null &&
          !Array.isArray(context) &&
          context.generationCancelled === true
        );
      });
    },
    async countInFlight(agentId) {
      const { count, error } = await client
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .in("state", [
          "OPEN",
          "CLUSTERED",
          "CLASSIFIED",
          "ASSERTED",
          "CANDIDATE",
          "APPLIED",
        ]);
      if (error) throw error;
      return count ?? 0;
    },
  };
}

async function signalRates(
  client: ServiceClient,
  sessionIds: string[],
): Promise<Record<SignalKind, number>> {
  if (sessionIds.length === 0) return zeroRates();
  const signals = await rows<Pick<Row<"signals">, "session_id" | "kind">>(
    client
      .from("signals")
      .select("session_id,kind")
      .in("session_id", sessionIds),
  );
  return Object.fromEntries(
    SIGNAL_KINDS.map((kind) => [
      kind,
      new Set(
        signals
          .filter((signal) => signal.kind === kind)
          .map(({ session_id }) => session_id),
      ).size / sessionIds.length,
    ]),
  ) as Record<SignalKind, number>;
}

function zeroRates(): Record<SignalKind, number> {
  return Object.fromEntries(
    SIGNAL_KINDS.map((kind) => [kind, 0]),
  ) as Record<SignalKind, number>;
}
