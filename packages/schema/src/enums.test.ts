import { describe, expect, it } from "vitest";

import {
  IncidentStateSchema,
  LaneSchema,
  OutcomeStatusSchema,
  SignalKindSchema,
  VerdictSchema,
} from "./enums.js";

describe("frozen enumerations", () => {
  it("keeps incident and outcome states closed", () => {
    expect(IncidentStateSchema.options).toContain("PARKED");
    expect(IncidentStateSchema.options).toContain("HUMAN_REVIEW");
    expect(IncidentStateSchema.safeParse("LOOPING").success).toBe(false);
    expect(OutcomeStatusSchema.options).toEqual([
      "PENDING",
      "CONFIRMED",
      "REFUTED",
      "UNOBSERVED",
      "REVERTED",
    ]);
  });

  it("keeps live lanes and signal kinds closed", () => {
    expect(LaneSchema.options).toEqual(["FIX", "PERSONALIZE", "ALERT", "NONE"]);
    expect(SignalKindSchema.options).toContain("PREFERENCE_STATED");
    expect(VerdictSchema.options).toContain("UNSUPPORTED");
    expect(VerdictSchema.safeParse("BUG").success).toBe(false);
  });
});
