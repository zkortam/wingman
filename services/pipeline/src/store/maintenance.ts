import type { ServiceClient } from "@wingman/db";

import type { PipelineRepository } from "../repository.js";
import type { Row } from "./mappers.js";
import { rows } from "./read-helpers.js";
import { checked } from "./write-helpers.js";

type MaintenanceStore = Pick<
  PipelineRepository,
  "expireIncidents" | "retainEvents"
>;

export function createMaintenanceStore(
  client: ServiceClient,
): MaintenanceStore {
  return {
    async expireIncidents(now) {
      const result = await client
        .from("incidents")
        .update({ state: "EXPIRED", state_reason: "NO_RECURRENCE_14D" })
        .lt("expires_at", now.toISOString())
        .not("state", "in", "(CONFIRMED,DISCARDED,EXPIRED,APPLIED,REVERTED)")
        .select("id");
      if (result.error) throw result.error;
      return result.data?.length ?? 0;
    },
    async retainEvents(before) {
      const sessions = await rows<Pick<Row<"sessions">, "id">>(
        client
          .from("sessions")
          .select("id")
          .lt("ingested_at", before.toISOString()),
      );
      if (sessions.length === 0) return 0;
      const ids = sessions.map(({ id }) => id);
      await checked(client.from("turns").delete().in("session_id", ids));
      await checked(client.from("signals").delete().in("session_id", ids));
      await checked(client.from("sessions").delete().in("id", ids));
      return ids.length;
    },
  };
}
