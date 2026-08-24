import type { ServiceClient } from "@wingman/db";
import { describe, expect, it } from "vitest";

import type { IncidentRecord, ObservedSession } from "../domain.js";
import { createWriteStore } from "./write.js";

const AGENT_ID = "10000000-0000-4000-8000-000000000001";
const ORG_ID = "20000000-0000-4000-8000-000000000001";
const FIRST_SESSION = "30000000-0000-4000-8000-000000000001";
const SECOND_SESSION = "30000000-0000-4000-8000-000000000002";
const INCIDENT_ID = "40000000-0000-4000-8000-000000000001";

describe("Supabase pipeline writes", () => {
  it("delegates create-or-join to the atomic database operation", async () => {
    const existing = incident();
    let reads = 0;
    let rpcArgs: Record<string, unknown> | undefined;
    const client = {
      rpc: (_name: string, args: Record<string, unknown>) => {
        rpcArgs = args;
        return {
          single: () => Promise.resolve({
            data: {
              ...incidentRow(),
              user_hashes: ["a".repeat(32), "b".repeat(32)],
              session_ids: [FIRST_SESSION, SECOND_SESSION],
              evidence_excerpts: [
                evidence(FIRST_SESSION, 1, "retry"),
                evidence(SECOND_SESSION, 2, "try again"),
              ],
              state: "CLUSTERED",
            },
            error: null,
          }),
        };
      },
    } as unknown as ServiceClient;
    const store = createWriteStore(client, {
      findIncident: () => Promise.resolve(reads++ === 0 ? null : existing),
      getIncident: () => Promise.resolve(existing),
    });

    const joined = await store.createOrJoinIncident({
      session: session(),
      key: "same-key",
      fingerprint: "same-fingerprint",
      signalKind: "RETRY_REQUEST",
      title: "Repeated bad decision",
      evidence: [evidence(SECOND_SESSION, 2, "try again")],
      expiresAt: "2026-08-24T00:00:00.000Z",
    });

    expect(joined.id).toBe(INCIDENT_ID);
    expect(joined.sessionIds).toEqual([FIRST_SESSION, SECOND_SESSION]);
    expect(joined.state).toBe("CLUSTERED");
    expect(rpcArgs?.p_cluster_minimum).toBe(2);
    expect(reads).toBe(0);
  });
});

const session = (): ObservedSession => ({
  id: SECOND_SESSION,
  orgId: ORG_ID,
  agentId: AGENT_ID,
  userHash: "b".repeat(32),
  taskFingerprint: "same-fingerprint",
  startedAt: "2026-08-23T00:01:00.000Z",
  endedAt: "2026-08-23T00:02:00.000Z",
  turns: [],
});

const incident = (): IncidentRecord => ({
  id: INCIDENT_ID,
  orgId: ORG_ID,
  agentId: AGENT_ID,
  key: "same-key",
  fingerprint: "same-fingerprint",
  signalKind: "RETRY_REQUEST",
  title: "Repeated bad decision",
  state: "OPEN",
  stateReason: null,
  attempt: 1,
  verdict: null,
  verdictConfidence: null,
  verdictEvidence: null,
  assertionId: null,
  userHashes: ["a".repeat(32)],
  sessionIds: [FIRST_SESSION],
  evidenceExcerpts: [evidence(FIRST_SESSION, 1, "retry")],
  firstSeen: "2026-08-23T00:00:00.000Z",
  lastSeen: "2026-08-23T00:00:00.000Z",
  expiresAt: "2026-08-24T00:00:00.000Z",
});

const incidentRow = () => ({
  id: INCIDENT_ID,
  org_id: ORG_ID,
  agent_id: AGENT_ID,
  key: "same-key",
  fingerprint: "same-fingerprint",
  signal_kind: "RETRY_REQUEST",
  title: "Repeated bad decision",
  state: "OPEN",
  state_reason: null,
  attempt: 1,
  verdict: null,
  verdict_confidence: null,
  verdict_evidence: null,
  assertion_id: null,
  user_hashes: ["a".repeat(32)],
  session_ids: [FIRST_SESSION],
  evidence_excerpts: [evidence(FIRST_SESSION, 1, "retry")],
  first_seen: "2026-08-23T00:00:00.000Z",
  last_seen: "2026-08-23T00:00:00.000Z",
  expires_at: "2026-08-24T00:00:00.000Z",
});

const evidence = (sessionId: string, turnIdx: number, textRedacted: string) => ({
  sessionId,
  turnIdx,
  kind: "RETRY_REQUEST",
  confidence: 0.9,
  baseline: 0.1,
  turns: [{ role: "user", textRedacted }],
});
