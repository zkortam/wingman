import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { StubRunner } from "../stubs/runner.js";
import { classifyVariance, runAssertion } from "./index.js";

const assertion = {
  id: randomUUID(),
  incidentId: randomUUID(),
  agentId: randomUUID(),
  definition: { kind: "TOOL_CALLED" as const, tool: "search" },
  identity: "a".repeat(64),
  sourceSessionId: null,
  polarity: "negative" as const,
  createdAt: new Date().toISOString(),
};

describe("verification runner", () => {
  it("runs five genuinely distinct intercepted samples concurrently", async () => {
    const result = await runAssertion({
      runner: new StubRunner(({ sample }) => ({
        toolCalls:
          sample === 0
            ? []
            : [{ id: String(sample), name: "search", args: {} }],
      })),
      assertion,
      config: { systemPrompt: "", tools: {}, retrieval: {}, rules: [] },
      messages: [],
      context: { session: {}, user: { rules: [] } },
    });
    expect(result.n).toBe(5);
    expect(result.passCount).toBe(4);
    // One cassette key holds five recorded responses, so the key is stable and it is
    // the decisions that must differ. Asserting distinct keys here would pass for a
    // runner that returns the same decision five times — ARCHITECTURE.md §9.
    expect(
      new Set(result.results.map(({ cassetteKey }) => cassetteKey)).size,
    ).toBe(1);
    expect(
      new Set(result.results.map(({ toolCalls }) => JSON.stringify(toolCalls)))
        .size,
    ).toBeGreaterThan(1);
    expect(result.toolExecutions).toBe(0);
  });

  it("classifies variance boundaries", () => {
    expect(classifyVariance(0, 5)).toBe("DEFECT");
    expect(classifyVariance(1, 5)).toBe("DEFECT");
    expect(classifyVariance(2, 5)).toBe("MODEL_VARIANCE");
    expect(classifyVariance(5, 5)).toBe("FALSE_POSITIVE");
  });
});
