import {
  StageError,
  type AgentRunner,
  type ConfigStore,
  type EventPublisher,
  type Ledger,
  type ModelClient,
} from "@outcome/schema";
import type { IngestService } from "@outcome/ingest";

import {
  clusterIdentity,
  evidenceExcerpt,
  incidentTitle,
} from "./cluster/index.js";
import { evaluateObservedConfirmation } from "./confirmation.js";
import { detectSignals } from "./detect/index.js";
import type { FixAgent } from "./fix/agent.js";
import type { AppServerClient } from "./fix/app-server.js";
import { consoleStageLogger, type StageLogger } from "./logging.js";
import { PIPELINE_POLICY } from "./policy.js";
import { processIncident } from "./process.js";
import type { PipelineRepository } from "./repository.js";

export interface PipelineEngine {
  observeSession(
    sessionId: string,
  ): Promise<{ incidentId: string | null; state: string }>;
}

export function createPipelineEngine(input: {
  repository: PipelineRepository;
  ingest: IngestService;
  runner: AgentRunner;
  configStore: ConfigStore;
  model: ModelClient;
  fixAgent: FixAgent;
  appServer: AppServerClient;
  ledger: Ledger;
  events: EventPublisher;
  logger?: StageLogger;
  now?: () => Date;
}): PipelineEngine {
  const logger = input.logger ?? consoleStageLogger;
  const now = input.now ?? (() => new Date());

  return {
    async observeSession(sessionId) {
      const session = await input.repository.getSession(sessionId);
      const detectStarted = performance.now();
      const baselines = await input.repository.getBaselines(
        session,
        new Date(
          now().getTime() -
            PIPELINE_POLICY.baselineWindowDays * 24 * 60 * 60 * 1_000,
        ),
      );
      const matchingRestart = await input.repository.hasMatchingRestart(
        session,
        PIPELINE_POLICY.restartWindowMinutes,
      );
      const signals = detectSignals({ session, baselines, matchingRestart });
      await input.ingest.writeSignals(signals);
      const confirmationStarted = performance.now();
      const confirmation = await evaluateObservedConfirmation({
        repository: input.repository,
        configStore: input.configStore,
        ledger: input.ledger,
        appServer: input.appServer,
        session,
        signalCount: signals.length,
      });
      if (confirmation !== null) {
        logger.write({
          incidentId: confirmation.incidentId,
          stage: "confirm",
          outcome: confirmation.status,
          durationMs: Math.round(performance.now() - confirmationStarted),
        });
      }
      if (signals.length === 0) return { incidentId: null, state: "NO_SIGNAL" };

      const clusterStarted = performance.now();
      const primary = [...signals].sort(
        (left, right) => right.confidence - left.confidence,
      )[0]!;
      const cluster = clusterIdentity(session, primary);
      let incident = await input.repository.createOrJoinIncident({
        session,
        key: cluster.key,
        fingerprint: cluster.fingerprint,
        signalKind: primary.kind,
        title: incidentTitle(session),
        evidence: signals.map((signal) => evidenceExcerpt(session, signal)),
        expiresAt: new Date(
          now().getTime() +
            PIPELINE_POLICY.incidentExpiryDays * 24 * 60 * 60 * 1_000,
        ).toISOString(),
      });
      logger.write({
        incidentId: incident.id,
        stage: "detect",
        outcome: signals.map(({ kind }) => kind).join("+"),
        durationMs: Math.round(performance.now() - detectStarted),
      });
      logger.write({
        incidentId: incident.id,
        stage: "cluster",
        outcome: incident.state,
        durationMs: Math.round(performance.now() - clusterStarted),
      });
      if (incident.state === "OPEN") {
        if (
          (await input.repository.countInFlight(session.agentId)) >
          PIPELINE_POLICY.maxInFlightIncidents
        ) {
          incident = await input.repository.updateIncident(
            incident.id,
            "OPEN",
            {
              state: "PARKED",
              stateReason: "CAP_EXCEEDED",
            },
          );
        }
        return { incidentId: incident.id, state: incident.state };
      }
      if (incident.state !== "CLUSTERED")
        return { incidentId: incident.id, state: incident.state };

      try {
        await input.events.publish(
          "incident.clustered",
          { data: { incidentId: incident.id } },
          `cluster:${incident.id}:${incident.attempt}`,
        );
        incident = await processIncident({
          ...input,
          repository: input.repository,
          logger,
          incident,
          session,
        });
        return { incidentId: incident.id, state: incident.state };
      } catch (error) {
        const current = await input.repository.getIncident(incident.id);
        const reason = stageReason(error);
        if (
          [
            "CONFIRMED",
            "DISCARDED",
            "PARKED",
            "REVERTED",
            "EXPIRED",
            "HUMAN_REVIEW",
          ].includes(current.state)
        ) {
          return { incidentId: current.id, state: current.state };
        }
        const parked = await input.repository.updateIncident(
          current.id,
          current.state,
          {
            state: "PARKED",
            stateReason: reason,
          },
        );
        return { incidentId: parked.id, state: parked.state };
      }
    },
  };
}

function stageReason(error: unknown): string {
  if (error instanceof StageError) return error.reason;
  if (
    error instanceof Error &&
    "reason" in error &&
    typeof error.reason === "string"
  )
    return error.reason;
  return "UNEXPECTED_STAGE_ERROR";
}
