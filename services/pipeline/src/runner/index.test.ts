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
    expect(
      new Set(result.results.map(({ cassetteKey }) => cassetteKey)).size,
    ).toBe(5);
    expect(result.toolExecutions).toBe(0);
  });

  it("classifies variance boundaries", () => {
    expect(classifyVariance(0, 5)).toBe("DEFECT");
    expect(classifyVariance(1, 5)).toBe("DEFECT");
    expect(classifyVariance(2, 5)).toBe("MODEL_VARIANCE");
    expect(classifyVariance(5, 5)).toBe("FALSE_POSITIVE");
  });
});
