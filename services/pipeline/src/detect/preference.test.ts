import { describe, expect, it } from "vitest";

import {
  isDurablePreference,
  preferenceStatedConfidence,
} from "./preference.js";

describe("preferenceStatedConfidence", () => {
  it("is highest when several cues agree", () => {
    expect(
      preferenceStatedConfidence("Just do it, stop asking me to confirm every step."),
    ).toBe(1);
  });

  it("is moderate on a single cue", () => {
    expect(preferenceStatedConfidence("Please be concise.")).toBe(0.7);
  });

  it("is zero on a plain task request", () => {
    expect(
      preferenceStatedConfidence("I want to return the hiking boots I bought."),
    ).toBe(0);
  });

  // The lane split depends on this: an irritated correction is a defect report, not a
  // preference, and must not end up as a permanent rule on the user's config.
  it("is zero on a correction that reports a wrong action", () => {
    expect(preferenceStatedConfidence("No, I said return, not cancel.")).toBe(0);
  });

  it("is insensitive to punctuation and case", () => {
    expect(preferenceStatedConfidence("JUST DO IT!!! Stop asking!")).toBe(
      preferenceStatedConfidence("just do it stop asking"),
    );
  });
});

describe("isDurablePreference", () => {
  it.each([
    "Always keep it short.",
    "From now on, skip the summary.",
    "Stop asking me to confirm.",
    "Don't ask me every time.",
  ])("treats %j as durable", (text) => {
    expect(isDurablePreference(text)).toBe(true);
  });

  it.each([
    "Keep this one short please.",
    "Just this time, skip the details.",
    "Shorter for now.",
  ])("treats %j as scoped to the turn", (text) => {
    expect(isDurablePreference(text)).toBe(false);
  });

  // "Always" plus "this time" is ambiguous, and the safe reading is the narrow one:
  // a wrongly persisted rule silently reshapes every later conversation.
  it("prefers the narrow reading when both cues appear", () => {
    expect(isDurablePreference("Always keep this one short.")).toBe(false);
  });
});
