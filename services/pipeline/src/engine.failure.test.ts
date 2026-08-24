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

    await expect(engine.observeSession(crypto.randomUUID())).resolves.toEqual({
      incidentId: null,
      state: "PARKED",
    });
  });
});
