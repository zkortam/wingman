import type { IncidentRecord } from "./domain.js";
import { runGate } from "./gate/index.js";
import { loggedStage } from "./logging.js";
import {
  continueFromAsserted,
  continueFromClassified,
  type ContinueInput,
} from "./process-continue.js";

export async function processIncident(
  input: ContinueInput,
): Promise<IncidentRecord> {
  if (input.incident.state === "ASSERTED") {
    return continueFromAsserted(input);
  }
  if (input.incident.state === "CLASSIFIED") {
    return continueFromClassified(input);
  }

  const { gate } = await loggedStage({
    logger: input.logger,
    incidentId: input.incident.id,
    stage: "gate",
    run: async () => {
      const base = await input.configStore.base(input.incident.agentId);
      const gate = await runGate({
        model: input.model,
        incident: input.incident,
        config: base,
        session: input.session,
      });
      return { base, gate };
    },
    outcome: ({ gate }) =>
      gate.requiresHumanReview ? "HUMAN_REVIEW" : gate.decision.verdict,
  });
  if (gate.requiresHumanReview) {
    return input.repository.updateIncident(input.incident.id, "CLUSTERED", {
      state: "HUMAN_REVIEW",
      stateReason: gate.decision.policyConflict
        ? "POLICY_CONFLICT"
        : "SCHEMA_AMBIGUITY_OR_LOW_CONFIDENCE",
      verdict: gate.decision.verdict,
      verdictConfidence: gate.decision.confidence,
      verdictEvidence: gate.decision.evidence,
    });
  }
  const incident = await input.repository.updateIncident(
    input.incident.id,
    "CLUSTERED",
    {
      state: "CLASSIFIED",
      verdict: gate.decision.verdict,
      verdictConfidence: gate.decision.confidence,
      verdictEvidence: gate.decision.evidence,
    },
  );
  await input.events.publish(
    "incident.classified",
    { data: { incidentId: incident.id, verdict: gate.decision.verdict } },
    `classify:${incident.id}:${incident.attempt}`,
  );
  return continueFromClassified({ ...input, incident });
}
