import {
  HandoffPayloadSchema,
  type ConfigStore,
  type EventPublisher,
  type Ledger,
  type PipelineCommands,
} from "@wingman/schema";

import { applyVerifiedCandidate } from "./apply.js";
import { markUnobserved } from "./confirmation.js";
import type { AppServerClient } from "./fix/app-server.js";
import type { PipelineRepository } from "./repository.js";

export function createPipelineCommands(input: {
  repository: PipelineRepository;
  configStore: ConfigStore;
  events: EventPublisher;
  ledger: Ledger;
  appServer: AppServerClient;
  now?: () => Date;
}): PipelineCommands {
  return {
    apply(incidentId, scope) {
      return applyVerifiedCandidate({ ...input, incidentId, scope });
    },
    async dismiss(incidentId, reason) {
      const normalized = reason.trim();
      if (normalized.length === 0 || normalized.length > 500) {
        throw new Error("Dismiss reason must contain 1 to 500 characters");
      }
      const incident = await input.repository.getIncident(incidentId);
      if (
        incident.state === "DISCARDED" &&
        incident.stateReason === `OPERATOR_DISMISSED:${normalized}`
      )
        return;
      await input.repository.updateIncident(incidentId, incident.state, {
        state: "DISCARDED",
        stateReason: `OPERATOR_DISMISSED:${normalized}`,
      });
    },
    async reopen(incidentId) {
      const incident = await input.repository.getIncident(incidentId);
      const reopenable = ["DISCARDED", "PARKED", "EXPIRED", "HUMAN_REVIEW"];
      if (!reopenable.includes(incident.state))
        throw new Error(`Cannot reopen incident in ${incident.state}`);
      const reopened = await input.repository.updateIncident(
        incidentId,
        incident.state,
        {
          state: "CLUSTERED",
          stateReason: "OPERATOR_REOPENED",
          attempt: incident.attempt + 1,
          verdict: null,
          verdictConfidence: null,
          verdictEvidence: null,
          assertionId: null,
        },
      );
      await input.events.publish(
        "incident.clustered",
        { data: { incidentId: reopened.id } },
        `reopen:${reopened.id}:${reopened.attempt}`,
      );
    },
    async handoff(incidentId) {
      const saved = await input.repository.getHandoff(incidentId);
      if (saved !== null) return saved.payload;
      const snapshot = await input.repository.getSnapshot(incidentId);
      if (snapshot.assertion === null || snapshot.before === null) {
        throw new Error("Handoff requires an assertion and failing proof");
      }
      const payload = HandoffPayloadSchema.parse({
        task: `Investigate code defect: ${snapshot.incident.title}`,
        context: {
          failingAssertion: snapshot.assertion.definition,
          failingRuns: snapshot.before.results,
          affectedUsers: snapshot.incident.userHashes,
          sessions: snapshot.incident.sessionIds,
          priorAttempts: [],
        },
        constraints: { maxIterations: 5, requireTestPass: true },
      });
      const { threadId } = await input.appServer.handoff(payload);
      await input.repository.saveHandoff({
        incidentId,
        payload,
        remoteThreadId: threadId,
      });
      return payload;
    },
    evaluateConfirmation(incidentId) {
      return markUnobserved({
        repository: input.repository,
        incidentId,
        now: input.now?.() ?? new Date(),
      });
    },
  };
}
