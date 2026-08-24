import { randomUUID } from "node:crypto";

import type {
  EmbeddingClient,
  EventPublisher,
  SessionInput,
} from "@wingman/schema";
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

  it("persists a valid session and publishes session.observed once", async () => {
    const writeSession = vi.fn<IngestStore["writeSession"]>();
    const publish = vi.fn<EventPublisher["publish"]>();
    const payload = session();
    const ingest = createIngestService({
      store: { writeSession, writeSignals: vi.fn() },
      embeddings: { embed: async ({ texts }) => texts.map(() => Array.from({ length: 1536 }, () => 0)) },
      events: { publish },
    });

    await expect(ingest.ingestEvents(payload)).resolves.toEqual({
      status: 202,
      sessionId: payload.id,
    });
    expect(writeSession).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(
      "session.observed",
      { data: { sessionId: payload.id } },
      payload.id,
    );
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
