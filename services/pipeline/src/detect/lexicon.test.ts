import { describe, expect, it } from "vitest";

import { retryRequestConfidence } from "./lexicon.js";

describe("retryRequestConfidence", () => {
  it("scores explicit retries and rejections, not a first request", () => {
    expect(retryRequestConfidence("Try again: export the filtered view")).toBe(1);
    expect(retryRequestConfidence("That's wrong, I asked to reschedule")).toBe(1);
    expect(retryRequestConfidence("No I meant Friday, not cancel")).toBe(1);
    expect(retryRequestConfidence("No, that is not what I asked")).toBe(0.8);
    expect(retryRequestConfidence("Export the filtered Negotiation view")).toBe(0);
  });
});
