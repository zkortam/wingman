import {
  assertedIncidentKey,
  assertionIdentity,
  type AgentConfig,
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
import { loggedStage, type StageLogger } from "./logging.js";
import type { PipelineRepository } from "./repository.js";
import { classifyVariance, runAssertion } from "./runner/index.js";

export type ContinueInput = {
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
};

export async function continueFromClassified(
  input: ContinueInput,
): Promise<IncidentRecord> {
  const base = await input.configStore.base(input.incident.agentId);
  if (input.incident.verdict === "VARIANCE") {
    return input.repository.updateIncident(input.incident.id, "CLASSIFIED", {
      state: "DISCARDED",
      stateReason: "GATE_VARIANCE",
    });
  }
  if (input.incident.verdict === "UNSUPPORTED") {
    return input.repository.updateIncident(input.incident.id, "CLASSIFIED", {
      state: "HUMAN_REVIEW",
      stateReason: "UNSUPPORTED_CAPABILITY",
    });
  }
  return assertAndVerify(input, base);
}

export async function continueFromAsserted(
  input: ContinueInput,
): Promise<IncidentRecord> {
  const base = await input.configStore.base(input.incident.agentId);
  if (input.incident.assertionId === null) {
    return assertAndVerify(input, base);
  }
  const assertion = await input.repository.getAssertion(
    input.incident.assertionId,
  );
  return verifyAndFix(input, base, assertion);
}

async function assertAndVerify(
  input: ContinueInput,
  base: AgentConfig,
): Promise<IncidentRecord> {
  let incident = input.incident;
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
  return verifyAndFix(
    { ...input, incident: asserted.incident },
    base,
    asserted.assertion,
  );
}

async function verifyAndFix(
  input: ContinueInput,
  base: AgentConfig,
  assertion: Awaited<ReturnType<PipelineRepository["getAssertion"]>>,
): Promise<IncidentRecord> {
  const incident = input.incident;
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
  if (incident.verdict === "CODE_DEFECT") {
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
