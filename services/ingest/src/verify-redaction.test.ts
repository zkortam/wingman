import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  RedactionVerificationError,
  verifyRedaction,
} from "./verify-redaction.js";

function payload() {
  return {
    id: randomUUID(),
    orgId: randomUUID(),
    agentId: randomUUID(),
    userHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    startedAt: "2026-08-23T00:00:00.000Z",
    turns: [
      {
        idx: 0,
        role: "user",
        textRedacted: "Search records",
        toolCalls: [] as Array<{
          id: string;
          name: string;
          args: Record<string, string>;
        }>,
        createdAt: "2026-08-23T00:00:00.000Z",
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

describe("verifyRedaction", () => {
  it("accepts a strict allowlisted envelope", () => {
    expect(verifyRedaction(payload()).userHash).toHaveLength(32);
  });

  it("rejects raw IDs, unknown fields, and nested identity fields", () => {
    expect(() =>
      verifyRedaction({ ...payload(), userId: "raw-user" }),
    ).toThrow();
    const nested = payload();
    const [firstTurn] = nested.turns;
    if (firstTurn === undefined) throw new Error("fixture needs one turn");
    firstTurn.toolCalls = [
      { id: "call", name: "search", args: { email: "raw@example.com" } },
    ];
    expect(() => verifyRedaction(nested)).toThrow(RedactionVerificationError);
  });

  it("rejects optional fields that were not allowlisted", () => {
    expect(() =>
      verifyRedaction({ ...payload(), lastQuery: "secret search" }),
    ).toThrow(RedactionVerificationError);
  });
});
