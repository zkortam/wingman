import { describe, expect, it } from "vitest";

import {
  applyDiff,
  ConfigDiffSchema,
  diffConfigs,
  isConfigPathWritable,
} from "./config.js";

const base = {
  systemPrompt: "a\n\u0000b",
  tools: {
    export_records: { description: "old", parameters: { enum: ["a", "b"] } },
  },
  retrieval: { topK: 5 },
  rules: ["one"],
};

describe("diffConfigs", () => {
  it("returns null when configs are identical and a bounded path list otherwise", () => {
    expect(diffConfigs(base, structuredClone(base))).toBeNull();
    expect(diffConfigs(base, { ...base, rules: ["two"] })).toEqual({
      changes: [{ path: "rules", before: ["one"], after: ["two"] }],
    });
  });
});

describe("ConfigDiff", () => {
  it("applies awkward JSON values without mutating the base", () => {
    const next = applyDiff(base, {
      changes: [
        {
          path: "tools.export_records.description",
          before: "old",
          after: "new\nvalue",
        },
      ],
    });
    expect(next.tools.export_records?.description).toBe("new\nvalue");
    expect(base.tools.export_records.description).toBe("old");
  });

  it("rejects overlap, path manipulation, and stale before values", () => {
    expect(() =>
      ConfigDiffSchema.parse({
        changes: [
          { path: "tools", before: {}, after: {} },
          { path: "tools.export_records", before: {}, after: {} },
        ],
      }),
    ).toThrow(/Overlapping/);
    expect(() =>
      ConfigDiffSchema.parse({
        changes: [{ path: "__proto__.polluted", before: null, after: true }],
      }),
    ).toThrow();
    expect(() =>
      ConfigDiffSchema.parse({
        changes: [{ path: "tools..polluted", before: null, after: true }],
      }),
    ).toThrow();
    expect(() =>
      applyDiff(base, {
        changes: [{ path: "systemPrompt", before: "stale", after: "new" }],
      }),
    ).toThrow(/changed/);
  });

  it("matches writable paths with explicit wildcard semantics", () => {
    expect(
      isConfigPathWritable(
        "tools.export_records.description",
        "tools.*.description",
      ),
    ).toBe(true);
    expect(
      isConfigPathWritable(
        "tools.export_records.description.extra",
        "tools.*.description",
      ),
    ).toBe(false);
    expect(isConfigPathWritable("retrieval.reranker.model", "retrieval.*")).toBe(
      true,
    );
    expect(isConfigPathWritable("retrieval", "retrieval.*")).toBe(false);
  });
});
