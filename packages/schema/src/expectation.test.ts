import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { AssertionContext } from "./assertion.js";
import type { AgentConfig } from "./config.js";
import {
  ExpectationSchema,
  expectationTool,
  isExpectationMet,
  isExpectationSupported,
  type Expectation,
} from "./expectation.js";

const config: AgentConfig = {
  systemPrompt: "Help customers with returns.",
  tools: {
    create_return: { description: "Start a return for an order." },
    cancel_order: { description: "Cancel an unshipped order." },
  },
  retrieval: {},
  rules: [],
};

const context: AssertionContext = { session: {}, user: { rules: [] } };

const expectation = (
  definition: Expectation["definition"],
): Expectation => ({
  id: randomUUID(),
  sessionId: randomUUID(),
  turnIdx: 0,
  definition,
  utterance: "I want to return the hiking boots I bought last week.",
  confidence: 0.9,
  state: "PENDING",
  createdAt: "2026-08-23T00:00:00.000Z",
  resolvedAt: null,
});

describe("ExpectationSchema", () => {
  it("accepts an expectation built from an assertion definition", () => {
    expect(() =>
      ExpectationSchema.parse(
        expectation({ kind: "TOOL_CALLED", tool: "create_return" }),
      ),
    ).not.toThrow();
  });

  it("rejects unknown fields so the console cannot smuggle state through it", () => {
    expect(() =>
      ExpectationSchema.parse({
        ...expectation({ kind: "TOOL_CALLED", tool: "create_return" }),
        lane: "FIX",
      }),
    ).toThrow();
  });
});

describe("isExpectationSupported", () => {
  it("is true when the agent has the implied tool", () => {
    expect(
      isExpectationSupported(
        expectation({ kind: "TOOL_CALLED", tool: "create_return" }),
        config,
      ),
    ).toBe(true);
  });

  // The ALERT/FIX split turns on this. An agent with no create_shipment tool has not
  // made a mistake, so routing it to FIX would fabricate a repair for a product gap.
  it("is false when the implied tool does not exist", () => {
    expect(
      isExpectationSupported(
        expectation({ kind: "TOOL_CALLED", tool: "create_shipment" }),
        config,
      ),
    ).toBe(false);
  });

  it("treats an output-shape expectation as always supported", () => {
    expect(
      isExpectationSupported(
        expectation({ kind: "OUTPUT_MATCHES_RULE", rule: "be concise" }),
        config,
      ),
    ).toBe(true);
  });

  it("is not satisfied by an inherited tools property", () => {
    expect(
      isExpectationSupported(
        expectation({ kind: "TOOL_CALLED", tool: "constructor" }),
        config,
      ),
    ).toBe(false);
  });
});

describe("isExpectationMet", () => {
  const returnExpected = expectation({
    kind: "TOOL_CALLED",
    tool: "create_return",
  });

  it("is met when the agent calls the expected tool", () => {
    expect(
      isExpectationMet(
        returnExpected,
        { toolCalls: [{ name: "create_return", args: {} }], text: null },
        context,
      ),
    ).toBe(true);
  });

  // The demo's first turn: asked to return, the agent cancels instead.
  it("is missed when the agent calls a different tool", () => {
    expect(
      isExpectationMet(
        returnExpected,
        { toolCalls: [{ name: "cancel_order", args: {} }], text: null },
        context,
      ),
    ).toBe(false);
  });

  it("is missed when the agent calls nothing at all", () => {
    expect(
      isExpectationMet(returnExpected, { toolCalls: [], text: "Sure!" }, context),
    ).toBe(false);
  });
});

describe("expectationTool", () => {
  it("names the tool for tool expectations", () => {
    expect(
      expectationTool(expectation({ kind: "TOOL_CALLED", tool: "create_return" })),
    ).toBe("create_return");
  });

  it("is null for output-shape expectations", () => {
    expect(
      expectationTool(
        expectation({ kind: "OUTPUT_MATCHES_RULE", rule: "be concise" }),
      ),
    ).toBeNull();
  });
});
