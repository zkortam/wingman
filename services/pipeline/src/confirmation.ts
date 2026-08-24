import type { ConfigStore, Ledger, Outcome } from "@outcome/schema";

import type { AppServerClient } from "./fix/app-server.js";
import type { ObservedSession } from "./domain.js";
import type { PipelineRepository } from "./repository.js";

export async function evaluateObservedConfirmation(input: {
  repository: PipelineRepository;
  configStore: ConfigStore;
  ledger: Ledger;
  appServer: AppServerClient;
  session: ObservedSession;
  signalCount: number;
}): Promise<Outcome | null> {
  const outcome = await input.repository.findPendingOutcome(input.session);
  if (outcome === null || outcome.status !== "PENDING") return outcome;
  const snapshot = await input.repository.getSnapshot(outcome.incidentId);
  if (input.signalCount > 0) {
    for (const userHash of outcome.appliedTo) {
      await input.configStore.revertOverride(
        snapshot.incident.agentId,
        userHash,
      );
    }
    const updated = await input.repository.updateOutcome(outcome.id, {
      status: "REFUTED",
      revertedAt: new Date().toISOString(),
    });
    await input.repository.updateIncident(snapshot.incident.id, "APPLIED", {
      state: "REVERTED",
      stateReason: "SIGNAL_RECURRED",
    });
    await recordConfirmation(
      input.ledger,
      snapshot.incident.id,
      snapshot.incident.fingerprint,
      snapshot.candidate?.diff,
      "REFUTED",
    );
    return updated;
  }

  const updated = await input.repository.updateOutcome(outcome.id, {
    status: "CONFIRMED",
    confirmedAt: new Date().toISOString(),
  });
  await input.repository.updateIncident(snapshot.incident.id, "APPLIED", {
    state: "CONFIRMED",
  });
  await recordConfirmation(
    input.ledger,
    snapshot.incident.id,
    snapshot.incident.fingerprint,
    snapshot.candidate?.diff,
    "CONFIRMED",
  );
  const threadId = snapshot.handoff?.remoteThreadId;
  if (threadId !== undefined && threadId !== null) {
    await input.appServer.writeAgentsMd({
      threadId,
      content: `Confirmed outcome ${snapshot.incident.id}: ${snapshot.incident.title}`,
    });
  }
  return updated;
}

export async function markUnobserved(input: {
  repository: PipelineRepository;
  incidentId: string;
  now: Date;
}): Promise<"CONFIRMED" | "REFUTED" | "UNOBSERVED"> {
  const snapshot = await input.repository.getSnapshot(input.incidentId);
  if (snapshot.outcome === null) throw new Error("Incident has no outcome");
  if (snapshot.outcome.status !== "PENDING") {
    return snapshot.outcome.status === "REVERTED"
      ? "REFUTED"
      : snapshot.outcome.status;
  }
  if (new Date(snapshot.outcome.windowEndsAt) > input.now) {
    throw new Error("Confirmation window is still open");
  }
  await input.repository.updateOutcome(snapshot.outcome.id, {
    status: "UNOBSERVED",
  });
  await input.repository.updateIncident(snapshot.incident.id, "APPLIED", {
    state: "CONFIRMED",
    stateReason: "UNOBSERVED_RETAINED",
  });
  return "UNOBSERVED";
}

async function recordConfirmation(
  ledger: Ledger,
  incidentId: string,
  fingerprint: string,
  diff: Awaited<ReturnType<PipelineRepository["getIncidentDiff"]>> | undefined,
  status: string,
): Promise<void> {
  if (diff === undefined || diff === null) return;
  await ledger.record({ incidentId, fingerprint, diff, outcome: status });
}
