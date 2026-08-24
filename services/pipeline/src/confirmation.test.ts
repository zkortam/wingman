import { randomUUID } from "node:crypto";

import { OutcomeSchema } from "@outcome/schema";
import { describe, expect, it } from "vitest";

import {
  evaluateObservedConfirmation,
  markUnobserved,
} from "./confirmation.js";
import { ReplayAppServerClient } from "./fix/app-server.js";
import { InMemoryLedger } from "./ledger/index.js";
import { StubConfigStore } from "./stubs/config-store.js";
import { ReplayDatabase } from "./stubs/database.js";
import { ReplayPipelineRepository } from "./stubs/repository.js";

describe("confirmation", () => {
  it("refutes and immediately reverts when a matching signal recurs", async () => {
    const fixture = await appliedFixture(
      new Date(Date.now() + 60_000).toISOString(),
    );
    expect(
      (await fixture.configStore.resolve(fixture.agentId, fixture.userHash))
        .systemPrompt,
    ).toBe("fixed");
    const outcome = await evaluateObservedConfirmation({
      repository: fixture.repository,
      configStore: fixture.configStore,
      ledger: new InMemoryLedger(),
      appServer: new ReplayAppServerClient(),
      session: fixture.session,
      signalCount: 2,
    });
    expect(outcome?.status).toBe("REFUTED");
    expect(
      (await fixture.configStore.resolve(fixture.agentId, fixture.userHash))
        .systemPrompt,
    ).toBe("base");
    expect(
      (await fixture.repository.getIncident(fixture.incidentId)).state,
    ).toBe("REVERTED");
  });

  it("retains an unobserved fix after the window", async () => {
    const fixture = await appliedFixture(
      new Date(Date.now() - 1_000).toISOString(),
    );
    expect(
      await markUnobserved({
        repository: fixture.repository,
        incidentId: fixture.incidentId,
        now: new Date(),
      }),
    ).toBe("UNOBSERVED");
    expect(
      (await fixture.configStore.resolve(fixture.agentId, fixture.userHash))
        .systemPrompt,
    ).toBe("fixed");
    expect(
      (await fixture.repository.getIncident(fixture.incidentId)).stateReason,
    ).toBe("UNOBSERVED_RETAINED");
  });
});

async function appliedFixture(windowEndsAt: string) {
  const database = new ReplayDatabase();
  const repository = new ReplayPipelineRepository(database);
  const configStore = new StubConfigStore(database);
  const agentId = randomUUID();
  const orgId = randomUUID();
  const incidentId = randomUUID();
  const candidateId = randomUUID();
  const userHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  configStore.seed(agentId, {
    systemPrompt: "base",
    tools: {},
    retrieval: {},
    rules: [],
  });
  const version = await configStore.writeVersion(
    agentId,
    { systemPrompt: "fixed", tools: {}, retrieval: {}, rules: [] },
    incidentId,
  );
  await configStore.setOverride(agentId, userHash, version.id, "USER");
  database.incidents.set(incidentId, {
    id: incidentId,
    orgId,
    agentId,
    key: "key",
    fingerprint: "fingerprint",
    signalKind: "RETRY_REQUEST",
    title: "Incident",
    state: "APPLIED",
    stateReason: null,
    attempt: 1,
    verdict: "PREFERENCE",
    verdictConfidence: 0.9,
    verdictEvidence: {},
    assertionId: null,
    userHashes: [userHash],
    sessionIds: [],
    evidenceExcerpts: [],
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    expiresAt: null,
  });
  const outcome = OutcomeSchema.parse({
    id: randomUUID(),
    incidentId,
    candidateId,
    scope: "USER",
    appliedTo: [userHash],
    appliedVersionId: version.id,
    status: "PENDING",
    windowEndsAt,
    confirmedAt: null,
    revertedAt: null,
    createdAt: new Date().toISOString(),
  });
  database.outcomes.set(outcome.id, outcome);
  const session = {
    id: randomUUID(),
    orgId,
    agentId,
    userHash,
    taskFingerprint: "fingerprint",
    startedAt: new Date().toISOString(),
    turns: [],
  };
  return { repository, configStore, agentId, incidentId, userHash, session };
}
