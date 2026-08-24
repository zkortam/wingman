import { describe, expect, it } from "vitest";

import { canTransition } from "./state.js";

describe("incident state transitions", () => {
  it("permits documented reopen states only", () => {
    for (const state of [
      "DISCARDED",
      "PARKED",
      "EXPIRED",
      "HUMAN_REVIEW",
    ] as const) {
      expect(canTransition(state, "CLUSTERED")).toBe(true);
    }
    expect(canTransition("CONFIRMED", "CLUSTERED")).toBe(false);
    expect(canTransition("REVERTED", "CLUSTERED")).toBe(false);
  });
});
