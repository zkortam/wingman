import { describe, expect, it } from "vitest";

import { restatedConstraintConfidence } from "./restated.js";

describe("restatedConstraintConfidence", () => {
  it("rises when the last turn repeats an earlier constraint or a stored rule", () => {
    expect(
      restatedConstraintConfidence({
        finalText: "Export only the Negotiation stage records",
        earlierUserTexts: ["Export the Negotiation stage records please"],
        rules: [],
      }),
    ).toBeGreaterThan(0.5);
    expect(
      restatedConstraintConfidence({
        finalText: "Keep replies short",
        earlierUserTexts: [],
        rules: ["Keep replies short"],
      }),
    ).toBe(1);
    expect(
      restatedConstraintConfidence({
        finalText: "ok",
        earlierUserTexts: ["Export the filtered view"],
        rules: [],
      }),
    ).toBe(0);
  });
});
