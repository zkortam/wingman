import type { AgentConfig, Expectation } from "@wingman/schema";
import { describe, expect, it } from "vitest";

import { MAX_CORRECTIVE_RULES, correctiveRule, repairForExpectation } from "./repair.js";

const CONFIG: AgentConfig = {
  systemPrompt: "You are a support agent.",
  tools: {
    reschedule_delivery: { description: "Change the delivery date." },
    cancel_order: { description: "Cancel an order." },
  },
  retrieval: {},
  rules: ["When a customer asks to move a delivery, cancel the order."],
};

const expectation = (overrides: Partial<Expectation> = {}): Expectation => ({
  id: "22222222-2222-4222-8222-222222222222",
  sessionId: "11111111-1111-4111-8111-111111111111",
  turnIdx: 0,
  definition: { kind: "TOOL_CALLED", tool: "reschedule_delivery" },
  utterance: "I need to reschedule my delivery to Friday",
  confidence: 0.9,
  state: "PENDING",
  createdAt: "2026-08-23T00:00:00.000Z",
  resolvedAt: null,
  ...overrides,
});

describe("the live repair", () => {
  it("prepends a corrective rule so it wins on precedence", () => {
    const repaired = repairForExpectation(CONFIG, expectation());
    expect(repaired?.rules[0]).toBe(
      "Correction: When a customer wants a different delivery date, or to change, move, or reschedule a delivery, use reschedule_delivery.",
    );
  });

  it("leaves the customer's own rules in place", () => {
    const repaired = repairForExpectation(CONFIG, expectation());
    expect(repaired?.rules).toContain(
      "When a customer asks to move a delivery, cancel the order.",
    );
  });

  it("changes nothing else about the config", () => {
    const repaired = repairForExpectation(CONFIG, expectation());
    expect(repaired).toMatchObject({
      systemPrompt: CONFIG.systemPrompt,
      tools: CONFIG.tools,
      retrieval: CONFIG.retrieval,
    });
  });

  it("does not mutate the config it was given", () => {
    repairForExpectation(CONFIG, expectation());
    expect(CONFIG.rules).toHaveLength(1);
  });
});

describe("what it refuses to repair", () => {
  it("declines when the expectation names a tool the agent does not have", () => {
    // That is a capability gap, and inventing a rule pointing at a tool which does not
    // exist would produce a fix that cannot possibly work.
    expect(
      repairForExpectation(
        CONFIG,
        expectation({ definition: { kind: "TOOL_CALLED", tool: "ship_abroad" } }),
      ),
    ).toBeNull();
  });

  it("declines when the expectation is about output rather than a tool", () => {
    expect(
      repairForExpectation(
        CONFIG,
        expectation({ definition: { kind: "OUTPUT_MATCHES_RULE", rule: "be brief" } }),
      ),
    ).toBeNull();
  });

  it("declines to add a rule that is already there", () => {
    const already: AgentConfig = {
      ...CONFIG,
      rules: [correctiveRule("I need to reschedule my delivery to Friday", "reschedule_delivery")],
    };
    expect(repairForExpectation(already, expectation())).toBeNull();
  });

  it("stops stacking corrective rules without bound", () => {
    const crowded: AgentConfig = {
      ...CONFIG,
      rules: Array.from({ length: MAX_CORRECTIVE_RULES }, (_, index) =>
        `Correction: dummy ${String(index)} use reschedule_delivery.`,
      ),
    };
    expect(repairForExpectation(crowded, expectation())).toBeNull();
  });
});
