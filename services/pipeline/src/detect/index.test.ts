import { describe, expect, it } from "vitest";

import type { ObservedSession } from "../domain.js";
import { detectSignals } from "./index.js";

const session: ObservedSession = {
  id: "00000000-0000-4000-8000-000000000001",
  orgId: "00000000-0000-4000-8000-000000000002",
  agentId: "00000000-0000-4000-8000-000000000003",
  userHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  taskFingerprint: "task",
  startedAt: "2026-01-01T00:00:00.000Z",
  turns: [
    {
      idx: 0,
      role: "user",
      textRedacted: "Export active filtered records",
      toolCalls: [],
      embedding: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      idx: 1,
      role: "assistant",
      textRedacted: null,
      toolCalls: [],
      embedding: null,
      createdAt: "2026-01-01T00:00:01.000Z",
    },
    {
      idx: 2,
      role: "user",
      textRedacted: "Try again: export active filtered records",
      toolCalls: [],
      embedding: null,
      createdAt: "2026-01-01T00:00:02.000Z",
    },
  ],
};

describe("detectSignals", () => {
  it("detects only the final user turn and requires a conjunction", () => {
    const signals = detectSignals({
      session,
      baselines: {
        RETRY_REQUEST: 0,
        RESTATED_CONSTRAINT: 0,
        ABANDON_RESTART: 0,
      },
      matchingRestart: false,
    });
    expect(signals.map(({ kind }) => kind)).toEqual([
      "RETRY_REQUEST",
      "RESTATED_CONSTRAINT",
    ]);
    expect(signals.every(({ turnIdx }) => turnIdx === 2)).toBe(true);
  });

  it("suppresses common behavior through the baseline", () => {
    expect(
      detectSignals({
        session,
        baselines: {
          RETRY_REQUEST: 0.6,
          RESTATED_CONSTRAINT: 0.6,
          ABANDON_RESTART: 0,
        },
        matchingRestart: false,
      }),
    ).toEqual([]);
  });

  it("uses a prior cancelled matching session for restart", () => {
    const signals = detectSignals({
      session,
      baselines: {
        RETRY_REQUEST: 0,
        RESTATED_CONSTRAINT: 0,
        ABANDON_RESTART: 0,
      },
      matchingRestart: true,
    });
    expect(signals.some(({ kind }) => kind === "ABANDON_RESTART")).toBe(true);
  });
});
