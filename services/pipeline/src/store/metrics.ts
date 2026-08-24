import type { ServiceClient } from "@outcome/db";

import type { PipelineRepository } from "../repository.js";
import type { Row } from "./mappers.js";
import { rows } from "./read-helpers.js";

type MetricsStore = Pick<
  PipelineRepository,
  "silentFailureRate" | "gatePrecision"
>;

export function createMetricsStore(client: ServiceClient): MetricsStore {
  return {
    async silentFailureRate(orgId, start, end) {
      const sessions = await rows<Pick<Row<"sessions">, "id">>(
        client
          .from("sessions")
          .select("id")
          .eq("org_id", orgId)
          .gte("started_at", start.toISOString())
          .lt("started_at", end.toISOString()),
      );
      if (sessions.length === 0) return 0;
      const signals = await rows<Pick<Row<"signals">, "session_id">>(
        client
          .from("signals")
          .select("session_id")
          .in(
            "session_id",
            sessions.map(({ id }) => id),
          ),
      );
      return (
        new Set(signals.map(({ session_id }) => session_id)).size /
        sessions.length
      );
    },
    async gatePrecision(orgId) {
      const incidents = await rows<
        Pick<Row<"incidents">, "id" | "attempt" | "assertion_id">
      >(
        client
          .from("incidents")
          .select("id,attempt,assertion_id")
          .eq("org_id", orgId)
          .not("assertion_id", "is", null),
      );
      let failed = 0;
      let total = 0;
      for (const incident of incidents) {
        const result = await client
          .from("runs")
          .select("pass_count")
          .eq("incident_id", incident.id)
          .eq("attempt", incident.attempt)
          .eq("phase", "VERIFY_FAIL")
          .maybeSingle();
        if (result.error) throw result.error;
        if (result.data !== null) {
          const run = result.data as Pick<Row<"runs">, "pass_count">;
          total += 1;
          if (run.pass_count <= 1) failed += 1;
        }
      }
      return { precision: total === 0 ? 0 : failed / total, n: total };
    },
  };
}
