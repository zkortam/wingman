import {
  applyDiff,
  StageError,
  type ConfigStore,
  type EventPublisher,
  type Ledger,
  type Scope,
} from "@wingman/schema";

import type { PipelineRepository } from "./repository.js";
import { PIPELINE_POLICY } from "./policy.js";

const HOUR_MS = 60 * 60 * 1_000;

export async function applyVerifiedCandidate(input: {
  repository: PipelineRepository;
  configStore: ConfigStore;
  events: EventPublisher;
  ledger: Ledger;
  incidentId: string;
  scope: Scope;
}): Promise<{ outcomeId: string; versionId: string }> {
  const snapshot = await input.repository.getSnapshot(input.incidentId);
  if (snapshot.outcome !== null) {
    if (snapshot.incident.state === "CANDIDATE" && snapshot.candidate) {
      await input.repository.updateCandidate(snapshot.candidate.id, {
        state: "APPLIED",
        newVersionId: snapshot.outcome.appliedVersionId,
      });
      await input.repository.updateIncident(snapshot.incident.id, "CANDIDATE", {
        state: "APPLIED",
      });
    }
    return {
      outcomeId: snapshot.outcome.id,
      versionId: snapshot.outcome.appliedVersionId,
    };
  }
  if (
    snapshot.incident.state !== "CANDIDATE" ||
    snapshot.candidate?.state !== "VERIFIED"
  ) {
    throw new Error("Incident does not have a verified candidate");
  }
  assertProof(snapshot);
  const base = await input.configStore.base(snapshot.incident.agentId);
  await input.configStore.assertWritable(
    snapshot.incident.agentId,
    snapshot.candidate.diff,
  );
  const config = applyDiff(base, snapshot.candidate.diff);
  const appliedTo = await applyTargets(input.repository, snapshot, input.scope);
  const version = snapshot.candidate.newVersionId
    ? {
        id: snapshot.candidate.newVersionId,
        version: 0,
      }
    : await input.configStore.writeVersion(
        snapshot.incident.agentId,
        config,
        snapshot.incident.id,
      );
  // DATA-MODEL.md §5: a GLOBAL apply moves the single agent pointer. Writing one
  // override row per affected user is the design that section exists to reject —
  // it makes revert an N-row operation and leaves unaffected users behind.
  // `appliedTo` still records the cohort, because the ledger needs it.
  const windowEndsAt = new Date(
    Date.now() + PIPELINE_POLICY.confirmationWindowHours * HOUR_MS,
  ).toISOString();
  const targets = input.scope === "GLOBAL" ? [""] : appliedTo;
  for (const userHash of targets) {
    await input.configStore.setOverride(
      snapshot.incident.agentId,
      userHash,
      version.id,
      input.scope,
    );
  }
  const outcome = await input.repository.createOutcome({
    incidentId: snapshot.incident.id,
    candidateId: snapshot.candidate.id,
    scope: input.scope,
    appliedTo,
    versionId: version.id,
    windowEndsAt,
  });
  await input.repository.updateCandidate(snapshot.candidate.id, {
    state: "APPLIED",
    newVersionId: version.id,
  });
  await input.repository.updateIncident(snapshot.incident.id, "CANDIDATE", {
    state: "APPLIED",
  });
  await input.ledger.record({
    incidentId: snapshot.incident.id,
    fingerprint: snapshot.incident.fingerprint,
    diff: snapshot.candidate.diff,
    outcome: "APPLIED",
  });
  await input.events.publish(
    "candidate.applied",
    {
      data: {
        incidentId: snapshot.incident.id,
        candidateId: snapshot.candidate.id,
        scope: input.scope,
      },
    },
    `apply:${snapshot.candidate.id}:${input.scope}`,
  );
  await input.events.publish(
    "confirmation.due",
    { data: { incidentId: snapshot.incident.id } },
    `confirm:${snapshot.incident.id}:${snapshot.candidate.id}`,
    { runAt: windowEndsAt },
  );
  return { outcomeId: outcome.id, versionId: version.id };
}

async function applyTargets(
  repository: PipelineRepository,
  snapshot: Awaited<ReturnType<PipelineRepository["getSnapshot"]>>,
  scope: Scope,
): Promise<string[]> {
  if (scope === "GLOBAL") return snapshot.incident.userHashes;
  const sessionId = snapshot.assertion?.sourceSessionId;
  if (sessionId === undefined || sessionId === null)
    throw new Error("USER apply requires a source session");
  return [(await repository.getSession(sessionId)).userHash];
}

function assertProof(
  snapshot: Awaited<ReturnType<PipelineRepository["getSnapshot"]>>,
): void {
  if (
    snapshot.before === null ||
    snapshot.before.passCount > PIPELINE_POLICY.verifyFailMaximumPasses
  ) {
    throw new StageError("apply", "NOT_ISOLATABLE", false);
  }
  if (
    snapshot.after === null ||
    snapshot.after.passCount < PIPELINE_POLICY.verifyPassMinimumPasses
  ) {
    throw new StageError("apply", "SUITE_REGRESSED", false);
  }
  if (snapshot.positiveSuite.some(({ passCount, n }) => passCount !== n)) {
    throw new StageError("apply", "SUITE_REGRESSED", false);
  }
}
