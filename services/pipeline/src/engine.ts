import {
  StageError,
  type AgentRunner,
  type ConfigStore,
  type EventPublisher,
  type Ledger,
  type ModelClient,
} from "@wingman/schema";
import type { IngestService } from "@wingman/ingest";

import {
  clusterIdentity,
  evidenceExcerpt,
  incidentTitle,
} from "./cluster/index.js";
import { evaluateObservedConfirmation } from "./confirmation.js";
import { detectSignals } from "./detect/index.js";
import type { IncidentRecord } from "./domain.js";
import type { FixAgent } from "./fix/agent.js";
import type { AppServerClient } from "./fix/app-server.js";
import { consoleStageLogger, type StageLogger } from "./logging.js";
import { PIPELINE_POLICY } from "./policy.js";
import { processIncident } from "./process.js";
import type { PipelineRepository } from "./repository.js";

const PROCESSABLE = new Set(["CLUSTERED", "CLASSIFIED", "ASSERTED"]);
const TERMINAL = new Set([
  "CONFIRMED",
  "DISCARDED",
  "PARKED",
  "REVERTED",
  "EXPIRED",
  "HUMAN_REVIEW",
]);

export interface PipelineEngine {
  observeSession(
    sessionId: string,
  ): Promise<{ incidentId: string | null; state: string }>;
  resumeIncident(
    incidentId: string,
  ): Promise<{ incidentId: string; state: string }>;
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

  const park = async (
    incident: IncidentRecord,
    reason: string,
  ): Promise<IncidentRecord> => {
    if (TERMINAL.has(incident.state) && incident.state !== "HUMAN_REVIEW") {
      return incident;
    }
    if (incident.state === "PARKED") return incident;
    return input.repository.updateIncident(incident.id, incident.state, {
      state: "PARKED",
      stateReason: reason,
    });
  };

  const run = async (
    incident: IncidentRecord,
    session: Awaited<ReturnType<PipelineRepository["getSession"]>>,
  ) =>
    processIncident({
      ...input,
      repository: input.repository,
      logger,
      incident,
      session,
    });

  return {
    async observeSession(sessionId) {
      let tracked: IncidentRecord | null = null;
      try {
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
        if (signals.length === 0)
          return { incidentId: null, state: "NO_SIGNAL" };

        const clusterStarted = performance.now();
        const [primary] = [...signals].sort(
          (left, right) => right.confidence - left.confidence,
        );
        if (primary === undefined)
          return { incidentId: null, state: "NO_SIGNAL" };
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
        tracked = incident;
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
            (await input.repository.countInFlight(session.agentId)) >=
            PIPELINE_POLICY.maxInFlightIncidents
          ) {
            incident = await input.repository.updateIncident(
              incident.id,
              "OPEN",
              { state: "PARKED", stateReason: "CAP_EXCEEDED" },
            );
          }
          return { incidentId: incident.id, state: incident.state };
        }
        if (!PROCESSABLE.has(incident.state))
          return { incidentId: incident.id, state: incident.state };

        try {
          incident = await run(incident, session);
          return { incidentId: incident.id, state: incident.state };
        } catch (error) {
          const current = await input.repository.getIncident(incident.id);
          if (TERMINAL.has(current.state)) {
            return { incidentId: current.id, state: current.state };
          }
          const parked = await park(current, stageReason(error));
          return { incidentId: parked.id, state: parked.state };
        }
      } catch (error) {
        if (tracked !== null) {
          try {
            const current = await input.repository.getIncident(tracked.id);
            const parked = await park(current, stageReason(error));
            return { incidentId: parked.id, state: parked.state };
          } catch {
            return { incidentId: tracked.id, state: "PARKED" };
          }
        }
        return { incidentId: null, state: "PARKED" };
      }
    },

    async resumeIncident(incidentId) {
      const incident = await input.repository.getIncident(incidentId);
      if (!PROCESSABLE.has(incident.state)) {
        return { incidentId: incident.id, state: incident.state };
      }
      const sessionId = incident.sessionIds[0];
      if (sessionId === undefined) {
        const parked = await park(incident, "SESSION_EVIDENCE_EXPIRED");
        return { incidentId: parked.id, state: parked.state };
      }
      try {
        const session = await input.repository.getSession(sessionId);
        const next = await run(incident, session);
        return { incidentId: next.id, state: next.state };
      } catch (error) {
        const current = await input.repository.getIncident(incident.id);
        if (TERMINAL.has(current.state)) {
          return { incidentId: current.id, state: current.state };
        }
        const parked = await park(current, stageReason(error));
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
