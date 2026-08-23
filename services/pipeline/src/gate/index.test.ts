import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { IncidentRecord, ObservedSession } from "../domain.js";
import { ReplayModelClient } from "../stubs/model.js";
import { runGate } from "./index.js";

const incident: IncidentRecord = {
  id: randomUUID(),
  orgId: randomUUID(),
  agentId: randomUUID(),
  key: "key",
  fingerprint: "fingerprint",
  signalKind: "RETRY_REQUEST",
  title: "Title",
  state: "CLUSTERED",
  stateReason: null,
  attempt: 1,
  verdict: null,
  verdictConfidence: null,
  verdictEvidence: null,
  assertionId: null,
  userHashes: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  sessionIds: [],
  evidenceExcerpts: [],
  firstSeen: "2026-08-23T00:00:00.000Z",
  lastSeen: "2026-08-23T00:00:00.000Z",
  expiresAt: null,
};
const session: ObservedSession = {
  id: randomUUID(),
  orgId: incident.orgId,
  agentId: incident.agentId,
  userHash: incident.userHashes[0]!,
  taskFingerprint: incident.fingerprint,
  startedAt: "2026-08-23T00:00:00.000Z",
  turns: [],
};
const config = { systemPrompt: "policy", tools: {}, retrieval: {}, rules: [] };

describe("gate", () => {
  it("routes low confidence and policy conflicts to human review", async () => {
    const low = await runGate({
      model: new ReplayModelClient([
        {
          verdict: "CONFIG_DEFECT",
          confidence: 0.74,
          evidence: {},
          policyConflict: false,
          refusalReason: null,
        },
      ]),
      incident,
      session,
      config,
    });
    expect(low.requiresHumanReview).toBe(true);
    const conflict = await runGate({
      model: new ReplayModelClient([
        {
          verdict: "CONFIG_DEFECT",
          confidence: 0.9,
          evidence: {},
          policyConflict: true,
          refusalReason: "policy",
        },
      ]),
      incident,
      session,
      config,
    });
    expect(conflict.requiresHumanReview).toBe(true);
  });

  it("treats schema ambiguity as human review", async () => {
    const result = await runGate({
      model: new ReplayModelClient([{ verdict: "CONFIG_DEFECT" }]),
      incident,
      session,
      config,
    });
    expect(result.requiresHumanReview).toBe(true);
    expect(result.decision.refusalReason).toBe("SCHEMA_AMBIGUITY");
  });
});
