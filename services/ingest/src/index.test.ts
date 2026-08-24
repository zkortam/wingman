import { randomUUID } from "node:crypto";

import type {
  EmbeddingClient,
  EventPublisher,
  SessionInput,
} from "@outcome/schema";
import { describe, expect, it, vi } from "vitest";

import { createIngestService, type IngestStore } from "./index.js";

describe("ingest embedding boundary", () => {
  it("propagates an explicit embedding failure without writing partial data", async () => {
    const failure = new Error("embedding cassette missing");
    const writeSession = vi.fn<IngestStore["writeSession"]>();
    const publish = vi.fn<EventPublisher["publish"]>();
    const embeddings: EmbeddingClient = {
      embed: vi.fn().mockRejectedValue(failure),
    };
    const ingest = createIngestService({
      store: { writeSession, writeSignals: vi.fn() },
      embeddings,
      events: { publish },
    });

    await expect(ingest.ingestEvents(session())).rejects.toBe(failure);
    expect(writeSession).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects invalid dimensions before persistence", async () => {
    const writeSession = vi.fn<IngestStore["writeSession"]>();
    const ingest = createIngestService({
      store: { writeSession, writeSignals: vi.fn() },
      embeddings: { embed: async () => [[0]] },
      events: { publish: vi.fn() },
    });

    await expect(ingest.ingestEvents(session())).rejects.toThrow(
      "Embedding client returned an invalid batch",
    );
    expect(writeSession).not.toHaveBeenCalled();
  });
});

function session(): SessionInput {
  const timestamp = "2026-08-23T18:00:00.000Z";
  return {
    id: randomUUID(),
    orgId: randomUUID(),
    agentId: randomUUID(),
    userHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    startedAt: timestamp,
    turns: [
      {
        idx: 0,
        role: "user",
        textRedacted: "Export the filtered records",
        toolCalls: [],
        createdAt: timestamp,
      },
    ],
    redaction: {
      mode: "allowlist",
      fields: ["turns"],
      piiScrubbed: true,
      userIdHashed: true,
    },
  };
}
