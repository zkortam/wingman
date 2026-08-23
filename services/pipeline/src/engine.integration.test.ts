import { randomUUID } from "node:crypto";

import { canonicalJSON, type SessionInput } from "@outcome/schema";
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

describe("full replay outcome loop", () => {
  it("auto-applies a verified USER preference, confirms it, and isolates a control user", async () => {
    const database = new ReplayDatabase();
    const repository = new ReplayPipelineRepository(database);
    const configStore = new StubConfigStore(database);
    const events = new ReplayEventPublisher();
    const ingest = createIngestService({
      store: new ReplayIngestStore(database),
      embeddings: new ReplayEmbeddingClient(),
      events,
    });
    const agentId = randomUUID();
    const orgId = randomUUID();
    configStore.seed(
      agentId,
      {
        systemPrompt: "BROKEN",
        tools: {
          export_records: {
            description: "Exports records from the current object.",
          },
        },
        retrieval: {},
        rules: [],
      },
      ["systemPrompt"],
    );

    const controlUser = "ffffffffffffffffffffffffffffffff";
    const controlBefore = canonicalJSON(
      await configStore.resolve(agentId, controlUser),
    );
    const loggedStages: string[] = [];
    const model = new ReplayModelClient([
      {
        verdict: "PREFERENCE",
        confidence: 0.92,
        evidence: { reason: "user-specific rule" },
        policyConflict: false,
        refusalReason: null,
      },
      {
        assertion: {
          kind: "TOOL_ARG_EQUALS",
          tool: "export_records",
          arg: "filters",
          expected: { $ref: "session.viewFilters" },
        },
      },
    ]);
    const engine = createPipelineEngine({
      repository,
      ingest,
      runner: new StubRunner(({ config, sample }) => ({
        toolCalls: [
          {
            id: `export-${sample ?? 0}`,
            name: "export_records",
            args:
              config.systemPrompt === "FIXED"
                ? { objectType: "opportunity", filters: { status: "New" } }
                : { objectType: "opportunity" },
          },
        ],
      })),
      configStore,
      model,
      fixAgent: new ReplayFixAgent([
        {
          changes: [{ path: "systemPrompt", before: "BROKEN", after: "FIXED" }],
        },
      ]),
      appServer: new ReplayAppServerClient(),
      ledger: new InMemoryLedger(),
      events,
      logger: {
        write({ stage }) {
          loggedStages.push(stage);
        },
      },
    });

    for (let index = 0; index < 10; index += 1) {
      await ingest.ingestEvents(
        session({
          orgId,
          agentId,
          userHash: index.toString(16).padStart(32, "0"),
          startedAt: `2026-08-20T00:${String(index).padStart(2, "0")}:00.000Z`,
          signaled: false,
        }),
      );
    }

    const first = session({
      orgId,
      agentId,
      userHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      startedAt: "2026-08-23T18:00:00.000Z",
      signaled: true,
    });
    const second = session({
      orgId,
      agentId,
      userHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      startedAt: "2026-08-23T18:05:00.000Z",
      signaled: true,
    });
    await ingest.ingestEvents(first);
    await ingest.ingestEvents(second);
    await ingest.ingestEvents(first);
    await ingest.ingestEvents(second);
    expect(database.sessions.size).toBe(12);
    expect(
      events.events.filter(({ name }) => name === "session.observed"),
    ).toHaveLength(12);
    expect((await engine.observeSession(first.id)).state).toBe("OPEN");
    const applied = await engine.observeSession(second.id);
    expect(applied.state).toBe("APPLIED");
    expect(
      (await repository.getSnapshot(incidentId(applied.incidentId))).before
        ?.passCount,
    ).toBe(0);
    expect(
      (await repository.getSnapshot(incidentId(applied.incidentId))).after
        ?.passCount,
    ).toBe(5);
    expect(loggedStages).toEqual(
      expect.arrayContaining([
        "detect",
        "cluster",
        "gate",
        "assert",
        "verify-fail",
        "fix",
        "verify-pass",
        "ledger",
        "apply",
      ]),
    );
    expect(
      (await configStore.resolve(agentId, second.userHash)).systemPrompt,
    ).toBe("FIXED");
    expect(
      (await configStore.resolve(agentId, first.userHash)).systemPrompt,
    ).toBe("BROKEN");
    expect(canonicalJSON(await configStore.resolve(agentId, controlUser))).toBe(
      controlBefore,
    );

    const confirmation = session({
      orgId,
      agentId,
      userHash: second.userHash,
      startedAt: "2026-08-23T18:10:00.000Z",
      signaled: false,
    });
    await ingest.ingestEvents(confirmation);
    expect((await engine.observeSession(confirmation.id)).state).toBe(
      "NO_SIGNAL",
    );
    expect(
      (await repository.getSnapshot(incidentId(applied.incidentId))).outcome
        ?.status,
    ).toBe("CONFIRMED");
    expect(loggedStages).toContain("confirm");
    await engine.observeSession(confirmation.id);
    expect(database.outcomes.size).toBe(1);
  });
});

function session(input: {
  orgId: string;
  agentId: string;
  userHash: string;
  startedAt: string;
  signaled: boolean;
}): SessionInput {
  const turns: SessionInput["turns"] = input.signaled
    ? [
        turn(0, "user", "Export active filtered records", []),
        turn(1, "assistant", null, [
          {
            id: "call",
            name: "export_records",
            args: { objectType: "opportunity" },
          },
        ]),
        turn(2, "user", "Try again: export active filtered records", []),
      ]
    : [
        turn(0, "user", "Export these records", []),
        turn(1, "assistant", null, [
          {
            id: "call",
            name: "export_records",
            args: { objectType: "opportunity" },
          },
        ]),
      ];
  return {
    id: randomUUID(),
    orgId: input.orgId,
    agentId: input.agentId,
    userHash: input.userHash,
    viewFilters: { status: "New" },
    startedAt: input.startedAt,
    turns,
    redaction: {
      mode: "allowlist",
      fields: ["turns", "viewFilters"],
      piiScrubbed: true,
      userIdHashed: true,
    },
  };
}

function turn(
  idx: number,
  role: "user" | "assistant",
  textRedacted: string | null,
  toolCalls: SessionInput["turns"][number]["toolCalls"],
): SessionInput["turns"][number] {
  return {
    idx,
    role,
    textRedacted,
    toolCalls,
    createdAt: `2026-08-23T18:00:0${idx}.000Z`,
  };
}
