import {
  assertedIncidentKey,
  assertionIdentity,
  type AgentRunner,
  type ConfigStore,
  type EventPublisher,
  type Ledger,
  type ModelClient,
} from "@wingman/schema";

import { generateAssertion } from "./assertion/generate.js";
import type { IncidentRecord, ObservedSession } from "./domain.js";
import type { FixAgent } from "./fix/agent.js";
import type { AppServerClient } from "./fix/app-server.js";
import { handoffCodeDefect } from "./fix/handoff.js";
import { assertionContext, proposeAndVerify } from "./fix/verify.js";
import { runGate } from "./gate/index.js";
import { loggedStage, type StageLogger } from "./logging.js";
import type { PipelineRepository } from "./repository.js";
import { classifyVariance, runAssertion } from "./runner/index.js";

export async function processIncident(input: {
  repository: PipelineRepository;
  runner: AgentRunner;
  configStore: ConfigStore;
  model: ModelClient;
  fixAgent: FixAgent;
  appServer: AppServerClient;
  ledger: Ledger;
  events: EventPublisher;
  logger: StageLogger;
  incident: IncidentRecord;
  session: ObservedSession;
}): Promise<IncidentRecord> {
  const { base, gate } = await loggedStage({
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
  let incident = await input.repository.updateIncident(
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
  if (gate.decision.verdict === "VARIANCE") {
    return input.repository.updateIncident(incident.id, "CLASSIFIED", {
      state: "DISCARDED",
      stateReason: "GATE_VARIANCE",
    });
  }

  const asserted = await loggedStage({
    logger: input.logger,
    incidentId: incident.id,
    stage: "assert",
    run: async () => {
      const definition = await generateAssertion({
        model: input.model,
        incident,
        session: input.session,
        config: base,
      });
      const identity = assertionIdentity(definition);
      if (incident.assertionId !== null) {
        const existing = await input.repository.getAssertion(
          incident.assertionId,
        );
        if (existing.identity !== identity) {
          incident = await input.repository.splitIncident(
            incident,
            assertedIncidentKey(incident.key, identity),
            identity,
          );
        }
      }
      const assertion = await input.repository.saveAssertion({
        incident,
        definition,
        identity,
        sourceSessionId: input.session.id,
        polarity: "negative",
      });
      incident = await input.repository.updateIncident(
        incident.id,
        "CLASSIFIED",
        { state: "ASSERTED", assertionId: assertion.id },
      );
      await input.events.publish(
        "incident.asserted",
        { data: { incidentId: incident.id, assertionId: assertion.id } },
        `assert:${incident.id}:${incident.attempt}`,
      );
      return { assertion, incident };
    },
    outcome: ({ assertion }) => assertion.definition.kind,
  });
  incident = asserted.incident;
  const assertion = asserted.assertion;

  const context = assertionContext(input.session, base.rules);
  const before = await loggedStage({
    logger: input.logger,
    incidentId: incident.id,
    stage: "verify-fail",
    run: async () => {
      const beforeResult = await runAssertion({
        runner: input.runner,
        assertion,
        config: base,
        messages: input.session.turns,
        context,
      });
      return input.repository.saveRun({
        assertionId: assertion.id,
        incidentId: incident.id,
        phase: "VERIFY_FAIL",
        attempt: incident.attempt,
        configVersionId: input.session.configVersionId ?? null,
        candidateId: null,
        ...beforeResult,
      });
    },
    outcome: ({ passCount, n }) => `${passCount}/${n}`,
  });
  const variance = classifyVariance(before.passCount, before.n);
  if (variance !== "DEFECT") {
    return input.repository.updateIncident(incident.id, "ASSERTED", {
      state: "DISCARDED",
      stateReason:
        variance === "MODEL_VARIANCE"
          ? "VERIFY_MODEL_VARIANCE"
          : "VERIFY_FALSE_POSITIVE",
    });
  }
  if (gate.decision.verdict === "CODE_DEFECT") {
    await loggedStage({
      logger: input.logger,
      incidentId: incident.id,
      stage: "handoff",
      run: () =>
        handoffCodeDefect({
          repository: input.repository,
          appServer: input.appServer,
          incident,
          assertion,
          before,
        }),
      outcome: () => "HUMAN_REVIEW",
    });
    return input.repository.updateIncident(incident.id, "ASSERTED", {
      state: "HUMAN_REVIEW",
      stateReason: "CODE_DEFECT_HANDOFF",
    });
  }
  return proposeAndVerify({
    ...input,
    incident,
    assertion,
    before,
    base,
    context,
  });
}
