import { createIngestService } from "@wingman/ingest";
import { describe, expect, it, vi } from "vitest";

import { createPipelineEngine } from "./engine.js";
import { ReplayFixAgent } from "./fix/agent.js";
import { ReplayAppServerClient } from "./fix/app-server.js";
import { InMemoryLedger } from "./ledger/index.js";
import { StubConfigStore } from "./stubs/config-store.js";
import { ReplayDatabase } from "./stubs/database.js";
import { ReplayEmbeddingClient } from "./stubs/embedding.js";
import { ReplayEventPublisher } from "./stubs/events.js";
import { ReplayIngestStore } from "./stubs/ingest-store.js";
import { ReplayModelClient } from "./stubs/model.js";
import { ReplayPipelineRepository } from "./stubs/repository.js";
import { StubRunner } from "./stubs/runner.js";

describe("pipeline failure containment", () => {
  it("contains a storage outage before an incident can be opened", async () => {
    const database = new ReplayDatabase();
    const repository = new ReplayPipelineRepository(database);
    vi.spyOn(repository, "getSession").mockRejectedValue(
      new Error("database offline"),
    );
    const events = new ReplayEventPublisher();
    const engine = createPipelineEngine({
      repository,
      ingest: createIngestService({
        store: new ReplayIngestStore(database),
        embeddings: new ReplayEmbeddingClient(),
        events,
      }),
      runner: new StubRunner(() => ({ toolCalls: [] })),
      configStore: new StubConfigStore(database),
      model: new ReplayModelClient([]),
      fixAgent: new ReplayFixAgent([]),
      appServer: new ReplayAppServerClient(),
      ledger: new InMemoryLedger(),
      events,
    });

    await expect(engine.observeSession(crypto.randomUUID())).rejects.toThrow(
      "database offline",
    );
  });

  it("persists PARKED on the incident when a post-join stage throws", async () => {
    const database = new ReplayDatabase();
    const repository = new ReplayPipelineRepository(database);
    const events = new ReplayEventPublisher();
    const incidentId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    vi.spyOn(repository, "getSession").mockResolvedValue({
      id: sessionId,
      orgId: crypto.randomUUID(),
      agentId: crypto.randomUUID(),
      userHash: "a".repeat(32),
      taskFingerprint: "fp",
      startedAt: "2026-08-23T00:00:00.000Z",
      turns: [
        {
          idx: 0,
          role: "user",
          textRedacted: "Export active filtered records",
          toolCalls: [],
          embedding: null,
          createdAt: "2026-08-23T00:00:00.000Z",
        },
        {
          idx: 1,
          role: "assistant",
          textRedacted: null,
          toolCalls: [{ name: "export_records", args: {} }],
          embedding: null,
          createdAt: "2026-08-23T00:00:01.000Z",
        },
        {
          idx: 2,
          role: "user",
          textRedacted: "Try again: export active filtered records",
          toolCalls: [],
          embedding: null,
          createdAt: "2026-08-23T00:00:02.000Z",
        },
      ],
    });
    vi.spyOn(repository, "getBaselines").mockResolvedValue({
      RETRY_REQUEST: 0,
      RESTATED_CONSTRAINT: 0,
      ABANDON_RESTART: 0,
      PREFERENCE_STATED: 0,
    });
    vi.spyOn(repository, "hasMatchingRestart").mockResolvedValue(false);
    vi.spyOn(repository, "createOrJoinIncident").mockResolvedValue({
      id: incidentId,
      orgId: crypto.randomUUID(),
      agentId: crypto.randomUUID(),
      key: "k",
      fingerprint: "fp",
      signalKind: "RETRY_REQUEST",
      title: "t",
      state: "OPEN",
      stateReason: null,
      attempt: 1,
      verdict: null,
      verdictConfidence: null,
      verdictEvidence: null,
      assertionId: null,
      userHashes: ["a".repeat(32)],
      sessionIds: [sessionId],
      evidenceExcerpts: [],
      firstSeen: "2026-08-23T00:00:00.000Z",
      lastSeen: "2026-08-23T00:00:00.000Z",
      expiresAt: null,
    });
    vi.spyOn(repository, "countInFlight").mockRejectedValue(new Error("lock timeout"));
    vi.spyOn(repository, "getIncident").mockResolvedValue({
      id: incidentId,
      orgId: crypto.randomUUID(),
      agentId: crypto.randomUUID(),
      key: "k",
      fingerprint: "fp",
      signalKind: "RETRY_REQUEST",
      title: "t",
      state: "OPEN",
      stateReason: null,
      attempt: 1,
      verdict: null,
      verdictConfidence: null,
      verdictEvidence: null,
      assertionId: null,
      userHashes: ["a".repeat(32)],
      sessionIds: [sessionId],
      evidenceExcerpts: [],
      firstSeen: "2026-08-23T00:00:00.000Z",
      lastSeen: "2026-08-23T00:00:00.000Z",
      expiresAt: null,
    });
    const parked = vi.spyOn(repository, "updateIncident").mockResolvedValue({
      id: incidentId,
      orgId: crypto.randomUUID(),
      agentId: crypto.randomUUID(),
      key: "k",
      fingerprint: "fp",
      signalKind: "RETRY_REQUEST",
      title: "t",
      state: "PARKED",
      stateReason: "UNEXPECTED_STAGE_ERROR",
      attempt: 1,
      verdict: null,
      verdictConfidence: null,
      verdictEvidence: null,
      assertionId: null,
      userHashes: ["a".repeat(32)],
      sessionIds: [sessionId],
      evidenceExcerpts: [],
      firstSeen: "2026-08-23T00:00:00.000Z",
      lastSeen: "2026-08-23T00:00:00.000Z",
      expiresAt: null,
    });
    const engine = createPipelineEngine({
      repository,
      ingest: createIngestService({
        store: new ReplayIngestStore(database),
        embeddings: new ReplayEmbeddingClient(),
        events,
      }),
      runner: new StubRunner(() => ({ toolCalls: [] })),
      configStore: new StubConfigStore(database),
      model: new ReplayModelClient([]),
      fixAgent: new ReplayFixAgent([]),
      appServer: new ReplayAppServerClient(),
      ledger: new InMemoryLedger(),
      events,
    });
    await expect(engine.observeSession(sessionId)).resolves.toEqual({
      incidentId,
      state: "PARKED",
    });
    expect(parked).toHaveBeenCalled();
  });
});
