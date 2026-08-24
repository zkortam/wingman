import { describe, expect, it } from "vitest";

import { classifyVariance } from "./variance.js";

describe("classifyVariance", () => {
  it("treats 0–1 passes as a defect, 2–4 as model variance, and 5 as a false positive", () => {
    expect(classifyVariance(0, 5)).toBe("DEFECT");
    expect(classifyVariance(1, 5)).toBe("DEFECT");
    expect(classifyVariance(2, 5)).toBe("MODEL_VARIANCE");
    expect(classifyVariance(4, 5)).toBe("MODEL_VARIANCE");
    expect(classifyVariance(5, 5)).toBe("FALSE_POSITIVE");
  });

  it("rejects counts that cannot have come from the sample loop", () => {
    expect(() => classifyVariance(-1, 5)).toThrow(RangeError);
    expect(() => classifyVariance(6, 5)).toThrow(RangeError);
    expect(() => classifyVariance(1.5, 5)).toThrow(RangeError);
  });
});
