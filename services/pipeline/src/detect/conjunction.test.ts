import { describe, expect, it } from "vitest";

import { requireConjunction } from "./conjunction.js";

const candidate = (
  kind: "RETRY_REQUEST" | "RESTATED_CONSTRAINT" | "ABANDON_RESTART" | "PREFERENCE_STATED",
  confidence: number,
) => ({
  kind,
  rawConfidence: confidence,
  confidence,
  baseline: 0,
  evidence: {},
});

describe("requireConjunction", () => {
  it("drops a lone cue and keeps two independent ones", () => {
    expect(
      requireConjunction([candidate("RETRY_REQUEST", 1)], 0.6),
    ).toEqual([]);
    expect(
      requireConjunction(
        [
          candidate("RETRY_REQUEST", 1),
          candidate("RESTATED_CONSTRAINT", 0.9),
          candidate("PREFERENCE_STATED", 0.2),
        ],
        0.6,
      ).map(({ kind }) => kind),
    ).toEqual(["RETRY_REQUEST", "RESTATED_CONSTRAINT"]);
  });
});
