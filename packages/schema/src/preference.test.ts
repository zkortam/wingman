import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { AgentConfig } from "./config.js";
import {
  applyPreferences,
  MAX_ACTIVE_PREFERENCES,
  PreferenceRuleSchema,
  type PreferenceRule,
} from "./preference.js";

const config: AgentConfig = {
  systemPrompt: "Help customers with returns.",
  tools: {},
  retrieval: {},
  rules: ["Never disclose internal order notes."],
};

const preference = (
  rule: string,
  state: PreferenceRule["state"] = "ACTIVE",
): PreferenceRule => ({
  id: randomUUID(),
  orgId: randomUUID(),
  agentId: randomUUID(),
  userHash: "a".repeat(32),
  rule,
  sourceSessionId: randomUUID(),
  sourceTurnIdx: 2,
  state,
  createdAt: "2026-08-23T00:00:00.000Z",
  revokedAt: null,
});

describe("PreferenceRuleSchema", () => {
  it("requires a 32 hex character user hash", () => {
    expect(() =>
      PreferenceRuleSchema.parse({ ...preference("Be brief."), userHash: "user-1" }),
    ).toThrow();
  });

  it("bounds the rule length so a preference cannot become a second prompt", () => {
    expect(() =>
      PreferenceRuleSchema.parse(preference("x".repeat(201))),
    ).toThrow();
  });
});

describe("applyPreferences", () => {
  it("appends active preferences to the resolved config rules", () => {
    expect(
      applyPreferences(config, [
        preference("Do not ask for confirmation before acting."),
      ]).rules,
    ).toEqual([
      "Never disclose internal order notes.",
      "Do not ask for confirmation before acting.",
    ]);
  });

  it("ignores revoked preferences", () => {
    expect(
      applyPreferences(config, [preference("Be brief.", "REVOKED")]).rules,
    ).toEqual(config.rules);
  });

  it("does not duplicate a rule the config already states", () => {
    expect(
      applyPreferences(config, [
        preference("Never disclose internal order notes."),
      ]).rules,
    ).toEqual(config.rules);
  });

  it("keeps the newest when more than the cap are active", () => {
    const rules = Array.from({ length: MAX_ACTIVE_PREFERENCES + 3 }, (_, index) =>
      preference(`Rule ${String(index)}.`),
    );
    const applied = applyPreferences(config, rules).rules;
    expect(applied).toHaveLength(config.rules.length + MAX_ACTIVE_PREFERENCES);
    expect(applied).toContain(`Rule ${String(MAX_ACTIVE_PREFERENCES + 2)}.`);
    expect(applied).not.toContain("Rule 0.");
  });

  it("does not mutate the config it was given", () => {
    const original = structuredClone(config);
    applyPreferences(config, [preference("Be brief.")]);
    expect(config).toEqual(original);
  });

  it("returns an equal config when there is nothing active", () => {
    expect(applyPreferences(config, [])).toEqual(config);
  });
});
