import { describe, expect, it } from "vitest";

import { continueFromClassified } from "./process-continue.js";

describe("continueFromClassified", () => {
  it("exports a resume entrypoint for CLASSIFIED incidents", () => {
    expect(typeof continueFromClassified).toBe("function");
  });
});
