import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { runExpirySweep, runRetentionSweep } from "./operations.js";
import { ReplayDatabase } from "./stubs/database.js";
import { ReplayPipelineRepository } from "./stubs/repository.js";

describe("retention", () => {
  it("deletes child events while preserving copied incident evidence", async () => {
    const database = new ReplayDatabase();
    const sessionId = randomUUID();
    const incidentId = randomUUID();
    const orgId = randomUUID();
    const agentId = randomUUID();
    database.sessions.set(sessionId, {
      id: sessionId,
      orgId,
      agentId,
      userHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      taskFingerprint: "task",
      startedAt: "2026-01-01T00:00:00.000Z",
      turns: [],
    });
    database.signals.push({
      sessionId,
      turnIdx: 0,
      kind: "RETRY_REQUEST",
      confidence: 1,
      baseline: 0,
      evidence: {},
    });
    database.incidents.set(incidentId, {
      id: incidentId,
      orgId,
      agentId,
      key: "key",
      fingerprint: "task",
      signalKind: "RETRY_REQUEST",
      title: "Incident",
      state: "DISCARDED",
      stateReason: null,
      attempt: 1,
      verdict: "VARIANCE",
      verdictConfidence: 0.9,
      verdictEvidence: {},
      assertionId: null,
      userHashes: [],
      sessionIds: [sessionId],
      evidenceExcerpts: [
        {
          sessionId,
          turnIdx: 0,
          kind: "RETRY_REQUEST",
          confidence: 1,
          baseline: 0,
          turns: [{ role: "user", textRedacted: "copied evidence" }],
        },
      ],
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-01-01T00:00:00.000Z",
      expiresAt: null,
    });
    const repository = new ReplayPipelineRepository(database);
    expect(
      await runRetentionSweep(repository, new Date("2026-03-01T00:00:00.000Z")),
    ).toBe(1);
    expect(database.sessions.size).toBe(0);
    expect(database.signals).toHaveLength(0);
    expect(
      (await repository.getIncident(incidentId)).evidenceExcerpts[0]?.turns[0]
        ?.textRedacted,
    ).toBe("copied evidence");
  });
});

describe("expiry", () => {
  it("expires an inactive incident after its deadline", async () => {
    const database = new ReplayDatabase();
    const incidentId = randomUUID();
    database.incidents.set(incidentId, {
      id: incidentId,
      orgId: randomUUID(),
      agentId: randomUUID(),
      key: "expired-key",
      fingerprint: "expired-fingerprint",
      signalKind: "RETRY_REQUEST",
      title: "Expired incident",
      state: "OPEN",
      stateReason: null,
      attempt: 1,
      verdict: null,
      verdictConfidence: null,
      verdictEvidence: null,
      assertionId: null,
      userHashes: [],
      sessionIds: [],
      evidenceExcerpts: [],
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-15T00:00:00.000Z",
    });
    const repository = new ReplayPipelineRepository(database);

    expect(
      await runExpirySweep(repository, new Date("2026-01-16T00:00:00.000Z")),
    ).toBe(1);
    expect((await repository.getIncident(incidentId)).state).toBe("EXPIRED");
  });
});
