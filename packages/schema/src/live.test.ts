import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  LiveClassificationSchema,
  NO_RECOVERY,
  RecoveryDirectiveSchema,
} from "./live.js";

describe("LiveClassificationSchema", () => {
  it("accepts a repairable fix", () => {
    expect(() =>
      LiveClassificationSchema.parse({
        lane: "FIX",
        expectationId: randomUUID(),
        repairable: true,
        rationale: "Asked for a return, the agent cancelled the order.",
        confidence: 0.82,
      }),
    ).not.toThrow();
  });

  it("accepts a preference and an alert", () => {
    expect(() =>
      LiveClassificationSchema.parse({
        lane: "PERSONALIZE",
        phrase: "Just do it, stop asking me to confirm every step.",
        rationale: "User asked twice to stop confirming.",
        confidence: 0.75,
      }),
    ).not.toThrow();
    expect(() =>
      LiveClassificationSchema.parse({
        lane: "ALERT",
        expectationId: randomUUID(),
        capabilityKey: "a".repeat(64),
        title: "International shipping",
        rationale: "No create_shipment tool exists.",
        confidence: 0.9,
      }),
    ).not.toThrow();
  });

  // A satisfied turn must be representable, or the classifier gets pushed toward
  // inventing a lane for every turn it sees.
  it("accepts NONE for a turn that needs no action", () => {
    expect(() =>
      LiveClassificationSchema.parse({
        lane: "NONE",
        rationale: "User confirmed the return was correct.",
      }),
    ).not.toThrow();
  });

  // The discriminated union is what stops a caller reading a preference off a FIX.
  it("rejects fields belonging to another lane", () => {
    expect(() =>
      LiveClassificationSchema.parse({
        lane: "PERSONALIZE",
        phrase: "Be brief.",
        rationale: "Stated twice.",
        confidence: 0.6,
        expectationId: randomUUID(),
      }),
    ).toThrow();
  });

  it("requires a rationale on every lane", () => {
    expect(() =>
      LiveClassificationSchema.parse({ lane: "NONE", rationale: "" }),
    ).toThrow();
  });
});

describe("RecoveryDirectiveSchema", () => {
  it("accepts a retry that points at a new config version", () => {
    expect(() =>
      RecoveryDirectiveSchema.parse({
        action: "RETRY",
        lane: "FIX",
        message: "Let me redo that as a return.",
        configVersionId: randomUUID(),
        incidentId: randomUUID(),
      }),
    ).not.toThrow();
  });

  it("accepts an acknowledgement with no config change", () => {
    expect(() =>
      RecoveryDirectiveSchema.parse({
        action: "ACKNOWLEDGE",
        lane: "ALERT",
        message: "We do not support international shipping yet.",
        configVersionId: null,
        incidentId: null,
      }),
    ).not.toThrow();
  });

  it("rejects an empty user-visible message rather than showing a blank turn", () => {
    expect(() =>
      RecoveryDirectiveSchema.parse({ ...NO_RECOVERY, message: "" }),
    ).toThrow();
  });

  it("treats the no-op directive as valid", () => {
    expect(() => RecoveryDirectiveSchema.parse(NO_RECOVERY)).not.toThrow();
  });
});
