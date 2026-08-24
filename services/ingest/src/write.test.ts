import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { SessionInput } from "@wingman/schema";

import { createSupabaseIngestStore } from "./write.js";

describe("createSupabaseIngestStore", () => {
  it("upserts sessions, turns, and signals without overwriting first-write wins", async () => {
    const writes: Array<{ table: string; rows: unknown; options: unknown }> = [];
    const store = createSupabaseIngestStore({
      from: (table: string) => ({
        upsert: async (rows: unknown, options: unknown) => {
          writes.push({ table, rows, options });
          return { error: null };
        },
      }),
    } as never);

    const session = sampleSession();
    await store.writeSession(session, "task-fingerprint", [
      {
        sessionId: session.id,
        idx: 0,
        role: "user",
        textRedacted: "Export these",
        toolCalls: [],
        embedding: [0, 1],
        createdAt: session.startedAt,
      },
    ]);
    await store.writeSignals([]);
    await store.writeSignals([
      {
        sessionId: session.id,
        turnIdx: 0,
        kind: "RETRY_REQUEST",
        confidence: 1,
        baseline: 0,
        evidence: { rawConfidence: 1 },
      },
    ]);

    expect(writes.map(({ table, options }) => ({ table, options }))).toEqual([
      { table: "sessions", options: { onConflict: "id", ignoreDuplicates: true } },
      { table: "turns", options: { onConflict: "session_id,idx", ignoreDuplicates: true } },
      {
        table: "signals",
        options: { onConflict: "session_id,turn_idx,kind", ignoreDuplicates: true },
      },
    ]);
  });
});

function sampleSession(): SessionInput {
  const timestamp = "2026-08-23T18:00:00.000Z";
  return {
    id: randomUUID(),
    orgId: randomUUID(),
    agentId: randomUUID(),
    userHash: "a".repeat(32),
    startedAt: timestamp,
    turns: [
      {
        idx: 0,
        role: "user",
        textRedacted: "Export these",
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
