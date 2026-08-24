import { describe, expect, it } from "vitest";
import { DiffTooLargeError, PathNotWritableError } from "@wingman/schema";

import { enforceDiffBounds, pathMatches } from "./bounds.js";

describe("fix bounds", () => {
  it("matches explicit paths and domain wildcards", () => {
    expect(pathMatches("tools.export.description", "tools.*")).toBe(true);
    expect(pathMatches("rules", "tools.*")).toBe(false);
  });

  it("parks illegal and excessive diffs immediately", () => {
    expect(() =>
      enforceDiffBounds({
        diff: { changes: [{ path: "retrieval.topK", before: 5, after: 10 }] },
        maxDiffBytes: 4096,
        writablePaths: ["tools.*"],
      }),
    ).toThrow(PathNotWritableError);
    expect(() =>
      enforceDiffBounds({
        diff: {
          changes: [
            { path: "systemPrompt", before: "a", after: "x".repeat(500) },
          ],
        },
        maxDiffBytes: 20,
        writablePaths: ["systemPrompt"],
      }),
    ).toThrow(DiffTooLargeError);
  });
});
