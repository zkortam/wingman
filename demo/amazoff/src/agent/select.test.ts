import { describe, expect, it } from "vitest";

import {
  AMAZOFF_BASE_CONFIG,
  AMAZOFF_FIXED_CONFIG,
  CANCEL_AND_REBOOK_RULE,
} from "./config.js";
import { selectTool } from "./select.js";

const RESCHEDULE = "I need to reschedule my delivery to Friday";

describe("the defect the demo depends on", () => {
  it("cancels the order when asked to reschedule, and names the rule that caused it", () => {
    expect(selectTool(RESCHEDULE, AMAZOFF_BASE_CONFIG)).toEqual({
      tool: "cancel_order",
      reason: "RULE",
      rule: CANCEL_AND_REBOOK_RULE,
    });
  });

  it("reschedules once the rule is gone, so the repair is a behaviour change", () => {
    expect(selectTool(RESCHEDULE, AMAZOFF_FIXED_CONFIG)).toEqual({
      tool: "reschedule_delivery",
      reason: "DESCRIPTION",
      rule: null,
    });
  });

  it("is phrasing-robust, so a typed-in demo does not hinge on one sentence", () => {
    for (const utterance of [
      "can you move my delivery to Friday instead",
      "I want to change the delivery date",
      "please push my delivery back a day",
    ]) {
      expect(selectTool(utterance, AMAZOFF_BASE_CONFIG)?.tool).toBe(
        "cancel_order",
      );
      expect(selectTool(utterance, AMAZOFF_FIXED_CONFIG)?.tool).toBe(
        "reschedule_delivery",
      );
    }
  });
});

describe("the rest of the agent, which the fix must not disturb", () => {
  it("still cancels when the customer actually asks to cancel", () => {
    for (const config of [AMAZOFF_BASE_CONFIG, AMAZOFF_FIXED_CONFIG]) {
      expect(selectTool("cancel my order", config)?.tool).toBe("cancel_order");
    }
  });

  it("routes lookups and returns unchanged by the repair", () => {
    expect(selectTool("look up my recent order", AMAZOFF_FIXED_CONFIG)?.tool).toBe(
      "get_order",
    );
    expect(
      selectTool("I want to return the shoes I received", AMAZOFF_FIXED_CONFIG)
        ?.tool,
    ).toBe("start_return");
  });

  it("declines rather than guessing when nothing matches", () => {
    expect(selectTool("what is the weather", AMAZOFF_FIXED_CONFIG)).toBeNull();
  });
});

describe("rule handling", () => {
  it("does not fire a rule merely because it mentions a tool", () => {
    // "cancel the order" appears in the bad rule, but the rule is about delivery
    // changes. A cancel request must not be attributed to it.
    expect(selectTool("cancel my order", AMAZOFF_BASE_CONFIG)?.reason).toBe(
      "DESCRIPTION",
    );
  });

  it("reads whatever rules the config carries rather than one known sentence", () => {
    const config = {
      ...AMAZOFF_FIXED_CONFIG,
      rules: ["If the customer mentions a refund, start a return first."],
    };
    expect(selectTool("I would like a refund", config)).toEqual({
      tool: "start_return",
      reason: "RULE",
      rule: "If the customer mentions a refund, start a return first.",
    });
  });
});
