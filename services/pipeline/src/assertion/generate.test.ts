import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { IncidentRecord, ObservedSession } from "../domain.js";
import { ReplayModelClient } from "../stubs/model.js";
import { generateAssertion } from "./generate.js";

const incident: IncidentRecord = {
  id: randomUUID(),
  orgId: randomUUID(),
  agentId: randomUUID(),
  key: "key",
  fingerprint: "fingerprint",
  signalKind: "RETRY_REQUEST",
  title: "Title",
  state: "CLASSIFIED",
  stateReason: null,
  attempt: 1,
  verdict: "CONFIG_DEFECT",
  verdictConfidence: 0.9,
  verdictEvidence: {},
  assertionId: null,
  userHashes: [],
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
  userHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  taskFingerprint: "fingerprint",
  startedAt: "2026-08-23T00:00:00.000Z",
  turns: [],
};

describe("assertion generation", () => {
  it("rejects OUTPUT_MATCHES_RULE after the capped attempts", async () => {
    const output = {
      assertion: { kind: "OUTPUT_MATCHES_RULE", rule: "match" },
    };
    await expect(
      generateAssertion({
        model: new ReplayModelClient([output, output, output]),
        incident,
        session,
        config: { systemPrompt: "", tools: {}, retrieval: {}, rules: [] },
      }),
    ).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
  });
});
