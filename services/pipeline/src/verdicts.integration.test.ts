import { randomUUID } from "node:crypto";

import type { SessionInput, Verdict } from "@outcome/schema";
import { createIngestService } from "@outcome/ingest";
import { describe, expect, it } from "vitest";

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

function incidentId(id: string | null): string {
  if (id === null) throw new Error("Expected the stage to open an incident");
  return id;
}

describe("verdict routing", () => {
  it.each([
    ["CONFIG_DEFECT", "CANDIDATE"],
    ["VARIANCE", "DISCARDED"],
    ["CODE_DEFECT", "HUMAN_REVIEW"],
  ] as const)("routes %s to %s", async (verdict, expectedState) => {
    const result = await execute(verdict);
    expect(result.state).toBe(expectedState);
    if (verdict === "CONFIG_DEFECT")
      expect(result.candidateState).toBe("VERIFIED");
    if (verdict === "CODE_DEFECT") expect(result.handoffCount).toBe(1);
  });
});

async function execute(verdict: Verdict) {
  const database = new ReplayDatabase();
  const repository = new ReplayPipelineRepository(database);
  const configStore = new StubConfigStore(database);
  const events = new ReplayEventPublisher();
  const ingest = createIngestService({
    store: new ReplayIngestStore(database),
    embeddings: new ReplayEmbeddingClient(),
    events,
  });
  const orgId = randomUUID();
  const agentId = randomUUID();
  configStore.seed(
    agentId,
    {
      systemPrompt: "BROKEN",
      tools: { export_records: { description: "Broken export" } },
      retrieval: {},
      rules: [],
    },
    ["systemPrompt"],
  );
  seedBaseline(database, orgId, agentId);
  const responses: unknown[] = [
    {
      verdict,
      confidence: 0.9,
      evidence: {},
      policyConflict: false,
      refusalReason: null,
    },
  ];
  if (verdict !== "VARIANCE") {
    responses.push({
      assertion: {
        kind: "TOOL_ARG_EQUALS",
        tool: "export_records",
        arg: "filters",
        expected: { $ref: "session.viewFilters" },
      },
    });
  }
  const appServer = new ReplayAppServerClient();
  const engine = createPipelineEngine({
    repository,
    ingest,
    configStore,
    events,
    appServer,
    model: new ReplayModelClient(responses),
    fixAgent: new ReplayFixAgent([
      { changes: [{ path: "systemPrompt", before: "BROKEN", after: "FIXED" }] },
    ]),
    ledger: new InMemoryLedger(),
    runner: new StubRunner(({ config, sample }) => ({
      toolCalls: [
        {
          id: `call-${sample ?? 0}`,
          name: "export_records",
          args:
            config.systemPrompt === "FIXED"
              ? { objectType: "opportunity", filters: { status: "New" } }
              : { objectType: "opportunity" },
        },
      ],
    })),
    logger: { write() {} },
  });
  const first = failureSession(
    orgId,
    agentId,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "2026-08-23T18:00:00.000Z",
  );
  const second = failureSession(
    orgId,
    agentId,
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "2026-08-23T18:05:00.000Z",
  );
  await ingest.ingestEvents(first);
  await ingest.ingestEvents(second);
  await engine.observeSession(first.id);
  const observed = await engine.observeSession(second.id);
  const snapshot = await repository.getSnapshot(
    incidentId(observed.incidentId),
  );
  return {
    state: observed.state,
    candidateState: snapshot.candidate?.state,
    handoffCount: appServer.handoffs.length,
  };
}

function seedBaseline(
  database: ReplayDatabase,
  orgId: string,
  agentId: string,
): void {
  for (let index = 0; index < 10; index += 1) {
    const id = randomUUID();
    database.sessions.set(id, {
      id,
      orgId,
      agentId,
      userHash: index.toString(16).padStart(32, "0"),
      taskFingerprint: null,
      startedAt: `2026-08-20T00:${String(index).padStart(2, "0")}:00.000Z`,
      turns: [],
    });
  }
}

function failureSession(
  orgId: string,
  agentId: string,
  userHash: string,
  startedAt: string,
): SessionInput {
  return {
    id: randomUUID(),
    orgId,
    agentId,
    userHash,
    viewFilters: { status: "New" },
    startedAt,
    turns: [
      {
        idx: 0,
        role: "user",
        textRedacted: "Export active filtered records",
        toolCalls: [],
        createdAt: startedAt,
      },
      {
        idx: 1,
        role: "assistant",
        textRedacted: null,
        toolCalls: [
          {
            id: "call",
            name: "export_records",
            args: { objectType: "opportunity" },
          },
        ],
        createdAt: startedAt,
      },
      {
        idx: 2,
        role: "user",
        textRedacted: "Try again: export active filtered records",
        toolCalls: [],
        createdAt: startedAt,
      },
    ],
    redaction: {
      mode: "allowlist",
      fields: ["turns", "viewFilters"],
      piiScrubbed: true,
      userIdHashed: true,
    },
  };
}
