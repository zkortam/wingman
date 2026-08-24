import { describe, expect, it } from "vitest";

import { JsonObjectSchema, JsonValueSchema } from "./json.js";

describe("JSON wire values", () => {
  it("accepts nested JSON and rejects NaN and undefined", () => {
    expect(JsonValueSchema.parse({ a: [1, "x", null, true] })).toEqual({
      a: [1, "x", null, true],
    });
    expect(JsonObjectSchema.parse({ filters: { stage: "Negotiation" } })).toEqual({
      filters: { stage: "Negotiation" },
    });
    expect(JsonValueSchema.safeParse(Number.NaN).success).toBe(false);
    expect(JsonObjectSchema.safeParse(["not-an-object"]).success).toBe(false);
  });
});
