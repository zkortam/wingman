import { randomUUID } from "node:crypto";

import type {
  AgentConfig,
  AgentDecision,
  Expectation,
  Signal,
  SignalKind,
} from "@outcome/schema";
import { describe, expect, it } from "vitest";

import { classifyTurn, type ClassifyInput } from "./classify.js";

const AGENT_ID = randomUUID();

const config: AgentConfig = {
  systemPrompt: "Help customers with returns.",
  tools: {
    create_return: { description: "Start a return for an order." },
    cancel_order: { description: "Cancel an unshipped order." },
  },
  retrieval: {},
  rules: [],
};

const signal = (kind: SignalKind, confidence: number): Signal => ({
  sessionId: randomUUID(),
  turnIdx: 1,
  kind,
  confidence,
  baseline: null,
  evidence: {},
});

const expectation = (tool: string): Expectation => ({
  id: randomUUID(),
  sessionId: randomUUID(),
  turnIdx: 0,
  definition: { kind: "TOOL_CALLED", tool },
  utterance: "I want to return the hiking boots I bought last week.",
  confidence: 0.9,
  state: "PENDING",
  createdAt: "2026-08-23T00:00:00.000Z",
  resolvedAt: null,
});

const decision = (tool: string): AgentDecision => ({
  toolCalls: [{ name: tool, args: {} }],
  text: null,
});

const input = (overrides: Partial<ClassifyInput>): ClassifyInput => ({
  agentId: AGENT_ID,
  signals: [],
  expectation: null,
  decision: null,
  config,
  context: { session: {}, user: { rules: [] } },
  utterance: "No, I said return, not cancel.",
  ...overrides,
});

describe("classifyTurn", () => {
  // The whole posture: Wingman watches turn one and says nothing. An agent reaching a
  // good answer by an unexpected route is normal, and acting on suspicion alone would
  // be worse than the occasional miss.
  it("does nothing when the user has not complained, even on a missed expectation", () => {
    expect(
      classifyTurn(
        input({
          expectation: expectation("create_return"),
          decision: decision("cancel_order"),
        }),
      ),
    ).toEqual({
      lane: "NONE",
      rationale: "No dissatisfaction signal on this turn.",
    });
  });

  it("routes a missed expectation to FIX once the user pushes back", () => {
    const result = classifyTurn(
      input({
        signals: [signal("RETRY_REQUEST", 0.8)],
        expectation: expectation("create_return"),
        decision: decision("cancel_order"),
      }),
    );
    expect(result.lane).toBe("FIX");
    expect(result).toMatchObject({ repairable: true, confidence: 0.8 });
  });

  it("routes to ALERT when the expected tool does not exist", () => {
    const result = classifyTurn(
      input({
        signals: [signal("RETRY_REQUEST", 0.9)],
        expectation: expectation("create_shipment"),
        decision: decision("cancel_order"),
        utterance: "Can you ship the replacement to Malaysia?",
      }),
    );
    expect(result.lane).toBe("ALERT");
    expect(result).toMatchObject({
      title: "Missing capability: create_shipment",
      capabilityKey: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown as string,
    });
  });

  // A capability gap outranks a defect: the agent was never given the tool, so a
  // config repair here would be a fabricated fix for a product decision.
  it("prefers ALERT over FIX when the tool is missing", () => {
    expect(
      classifyTurn(
        input({
          signals: [
            signal("RETRY_REQUEST", 0.9),
            signal("RESTATED_CONSTRAINT", 0.9),
          ],
          expectation: expectation("create_shipment"),
          decision: decision("cancel_order"),
        }),
      ).lane,
    ).toBe("ALERT");
  });

  it("routes a durable style instruction to PERSONALIZE", () => {
    const result = classifyTurn(
      input({
        signals: [signal("PREFERENCE_STATED", 0.9)],
        utterance: "Just do it, stop asking me to confirm every step.",
      }),
    );
    expect(result.lane).toBe("PERSONALIZE");
    expect(result).toMatchObject({
      phrase: "Just do it, stop asking me to confirm every step.",
    });
  });

  // A wrong answer is a fact and a verbose one is a taste. A user who is both wronged
  // and annoyed needs the fact addressed.
  it("prefers FIX over PERSONALIZE when the expectation was also missed", () => {
    expect(
      classifyTurn(
        input({
          signals: [
            signal("RETRY_REQUEST", 0.8),
            signal("PREFERENCE_STATED", 0.9),
          ],
          expectation: expectation("create_return"),
          decision: decision("cancel_order"),
          utterance: "No, return it, and stop asking me to confirm.",
        }),
      ).lane,
    ).toBe("FIX");
  });

  it("does not persist a preference scoped to the current turn", () => {
    expect(
      classifyTurn(
        input({
          signals: [signal("PREFERENCE_STATED", 0.9)],
          utterance: "Keep this one short please.",
        }),
      ),
    ).toEqual({
      lane: "NONE",
      rationale: "Style comment scoped to this turn; nothing durable to persist.",
    });
  });

  it("ignores a preference signal below the confidence floor", () => {
    expect(
      classifyTurn(
        input({
          signals: [signal("PREFERENCE_STATED", 0.2)],
          utterance: "Always keep it short.",
        }),
      ).lane,
    ).toBe("NONE");
  });

  it("takes no action when the expectation was met but the user is unhappy", () => {
    expect(
      classifyTurn(
        input({
          signals: [signal("RETRY_REQUEST", 0.8)],
          expectation: expectation("create_return"),
          decision: decision("create_return"),
        }),
      ),
    ).toEqual({
      lane: "NONE",
      rationale: "The expectation was met; nothing to repair.",
    });
  });

  it("takes no action on dissatisfaction with no expectation to explain it", () => {
    expect(
      classifyTurn(input({ signals: [signal("RETRY_REQUEST", 0.8)] })),
    ).toEqual({
      lane: "NONE",
      rationale: "Dissatisfaction with no expectation to explain it.",
    });
  });

  it("treats a turn with no agent decision as a miss", () => {
    expect(
      classifyTurn(
        input({
          signals: [signal("RETRY_REQUEST", 0.8)],
          expectation: expectation("create_return"),
          decision: null,
        }),
      ).lane,
    ).toBe("FIX");
  });

  it("reports the strongest dissatisfaction confidence", () => {
    expect(
      classifyTurn(
        input({
          signals: [
            signal("RETRY_REQUEST", 0.6),
            signal("ABANDON_RESTART", 0.95),
          ],
          expectation: expectation("create_return"),
          decision: decision("cancel_order"),
        }),
      ),
    ).toMatchObject({ confidence: 0.95 });
  });
});
