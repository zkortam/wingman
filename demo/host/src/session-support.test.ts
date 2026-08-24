import { describe, expect, it } from "vitest";

import { expectedTool, smallTalk } from "./session-support.js";

describe("demo session support", () => {
  it("keeps small talk out of expectation generation", () => {
    expect(smallTalk.test("Thanks!")).toBe(true);
    expect(smallTalk.test("Reschedule my delivery")).toBe(false);
  });

  it("maps executable expectations to their tool", () => {
    expect(expectedTool({
      id: "10000000-0000-4000-8000-000000000001",
      sessionId: "20000000-0000-4000-8000-000000000001",
      turnIdx: 1,
      utterance: "Reschedule it",
      definition: { kind: "TOOL_CALLED", tool: "reschedule_delivery" },
      confidence: 0.9,
      state: "PENDING",
      createdAt: "2026-08-23T00:00:00.000Z",
      resolvedAt: null,
    })).toBe("reschedule_delivery");
  });
});
