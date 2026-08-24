import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ObservedSession } from "../domain.js";
import {
  clusterIdentity,
  evidenceExcerpt,
  incidentTitle,
} from "./index.js";

const session = (overrides: Partial<ObservedSession> = {}): ObservedSession => ({
  id: randomUUID(),
  orgId: randomUUID(),
  agentId: randomUUID(),
  userHash: "a".repeat(32),
  taskFingerprint: "export:opportunity",
  startedAt: "2026-08-23T00:00:00.000Z",
  turns: [
    {
      idx: 0,
      role: "user",
      textRedacted: "Export the filtered Negotiation view",
      toolCalls: [],
      embedding: null,
      createdAt: "2026-08-23T00:00:00.000Z",
    },
  ],
  ...overrides,
});

describe("clusterIdentity", () => {
  it("keys on agent, signal kind, and the session fingerprint", () => {
    const observed = session();
    const clustered = clusterIdentity(observed, {
      sessionId: observed.id,
      turnIdx: 0,
      kind: "RETRY_REQUEST",
      confidence: 0.9,
      baseline: 0.1,
      evidence: {},
    });
    expect(clustered.fingerprint).toBe("export:opportunity");
    expect(clustered.key).toHaveLength(64);
  });

  it("falls back to a text hash when no task fingerprint or embeddings exist", () => {
    const observed = session({ taskFingerprint: null });
    const first = clusterIdentity(observed, {
      sessionId: observed.id,
      turnIdx: 0,
      kind: "RETRY_REQUEST",
      confidence: 0.9,
      baseline: 0,
      evidence: {},
    });
    const second = clusterIdentity(observed, {
      sessionId: observed.id,
      turnIdx: 0,
      kind: "RETRY_REQUEST",
      confidence: 0.9,
      baseline: 0,
      evidence: {},
    });
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toBe("export:opportunity");
  });
});

describe("incidentTitle", () => {
  it("uses the latest user text, truncated", () => {
    expect(incidentTitle(session())).toBe("Export the filtered Negotiation view");
    expect(
      incidentTitle(
        session({
          turns: [
            {
              idx: 0,
              role: "user",
              textRedacted: "x".repeat(90),
              toolCalls: [],
              embedding: null,
              createdAt: "2026-08-23T00:00:00.000Z",
            },
          ],
        }),
      ),
    ).toHaveLength(80);
  });
});

describe("evidenceExcerpt", () => {
  it("copies the signaled turn and the two before it", () => {
    const observed = session({
      turns: [0, 1, 2, 3].map((idx) => ({
        idx,
        role: idx % 2 === 0 ? ("user" as const) : ("assistant" as const),
        textRedacted: `turn ${idx}`,
        toolCalls: [],
        embedding: null,
        createdAt: `2026-08-23T00:00:0${idx}.000Z`,
      })),
    });
    const excerpt = evidenceExcerpt(observed, {
      sessionId: observed.id,
      turnIdx: 3,
      kind: "RESTATED_CONSTRAINT",
      confidence: 0.8,
      baseline: 0,
      evidence: {},
    });
    expect(excerpt.turns.map(({ textRedacted }) => textRedacted)).toEqual([
      "turn 1",
      "turn 2",
      "turn 3",
    ]);
  });
});
