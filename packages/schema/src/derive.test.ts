import { describe, expect, it } from "vitest";

import {
  assertedIncidentKey,
  assertionIdentity,
  incidentKey,
  taskFingerprint,
  userHash,
} from "./derive.js";
import type { SessionInput } from "./session.js";

// DATA-MODEL.md §7. Both engineers implement these and they must agree byte for
// byte, so the expectations are pinned literals. A drift here re-buckets every
// incident and breaks idempotency under Inngest redelivery.
const AGENT_ID = "11111111-1111-4111-8111-111111111111";

const session = (
  toolCalls: SessionInput["turns"][number]["toolCalls"],
): SessionInput => ({
  id: "22222222-2222-4222-8222-222222222222",
  orgId: "33333333-3333-4333-8333-333333333333",
  agentId: AGENT_ID,
  userHash: "6b1ccef6c90591b04ce982ade55eb7d5",
  startedAt: "2026-01-01T00:00:00.000Z",
  turns: [
    {
      idx: 0,
      role: "user",
      textRedacted: "Export these",
      toolCalls,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  redaction: {
    mode: "allowlist",
    fields: [],
    piiScrubbed: true,
    userIdHashed: true,
  },
});

describe("userHash", () => {
  it("is the first 32 hex chars of hmac-sha256(orgSalt, userId)", () => {
    expect(userHash("org-salt", "user-1")).toBe("6b1ccef6c90591b04ce982ade55eb7d5");
  });

  it("is 32 lowercase hex characters", () => {
    expect(userHash("org-salt", "user-1")).toMatch(/^[a-f0-9]{32}$/);
  });

  it("is salted per org so a hash cannot be correlated across customers", () => {
    expect(userHash("salt-a", "user-1")).not.toBe(userHash("salt-b", "user-1"));
  });
});

describe("taskFingerprint", () => {
  it("hashes agentId, first tool name, and its object type", () => {
    expect(
      taskFingerprint(
        session([
          { name: "export_records", args: { objectType: "opportunity" } },
        ]),
      ),
    ).toBe("d9aa8154766cfdbe59c1e362dcda778bea821a380a8f3235df48daac260ca207");
  });

  it("falls back to 'unknown' when no object type is present", () => {
    expect(
      taskFingerprint(session([{ name: "export_records", args: {} }])),
    ).toBe("9f3838fdd4b83b8d6a45ee79a8f78c2546670d4169a9b269b4bd1ca6a7fe1ee5");
  });

  it("ignores tool decisions after the first", () => {
    expect(
      taskFingerprint(
        session([
          { name: "export_records", args: { objectType: "opportunity" } },
          { name: "search_records", args: { objectType: "contact" } },
        ]),
      ),
    ).toBe(taskFingerprint(session([{ name: "export_records", args: { objectType: "opportunity" } }])));
  });

  // §7's prose: with no tool decision and embeddings cut, "sessions with no tool
  // decision simply do not cluster — an acceptable loss, documented rather than
  // hidden". Returning null is that documented loss; the fallback argument is the
  // hook for the embedding centroid.
  it("returns null with no tool decision and no fallback", () => {
    expect(taskFingerprint(session([]))).toBeNull();
  });

  it("uses the supplied fallback when there is no tool decision", () => {
    expect(taskFingerprint(session([]), "centroid")).toBe("centroid");
  });
});

describe("incidentKey", () => {
  it("hashes agentId, signalKind, and fingerprint", () => {
    expect(incidentKey(AGENT_ID, "RETRY_REQUEST", "fp")).toBe(
      "1c50ab2292840fecb6af5b1302aa2ce95979b51dc64d14fb45e992517e31adf1",
    );
  });

  it("separates signal kinds for the same fingerprint", () => {
    expect(incidentKey(AGENT_ID, "RETRY_REQUEST", "fp")).not.toBe(
      incidentKey(AGENT_ID, "RESTATED_CONSTRAINT", "fp"),
    );
  });
});

describe("assertedIncidentKey", () => {
  it("hashes the bucket key with the assertion identity", () => {
    expect(assertedIncidentKey("bucket", "identity")).toBe(
      "34cd7bad0b18bbf6490d9bad37bd1ace1c67d127482843cbe55214821ba78cc5",
    );
  });
});

describe("assertionIdentity", () => {
  it("hashes canonical JSON of kind and params", () => {
    expect(
      assertionIdentity({
        kind: "TOOL_ARG_EQUALS",
        tool: "export_records",
        arg: "filters",
        expected: { $ref: "session.viewFilters" },
      }),
    ).toBe("1c42f6fa61ab30756654321eb85de0bc28d413e6cd03f9cce27f8692275d0899");
  });

  it("is independent of key order", () => {
    expect(
      assertionIdentity({
        kind: "TOOL_CALLED",
        tool: "export_records",
      }),
    ).toBe("c3f40295c933e6775d9cafa4246c315adbbbb0a316bda922650e3797bcb8292c");
  });

  // "Fingerprint buckets; identity identifies." A differing identity must produce a
  // different key so the incident splits rather than absorbing an unrelated failure.
  it("distinguishes assertions that differ only in a param", () => {
    expect(assertionIdentity({ kind: "TOOL_CALLED", tool: "a" })).not.toBe(
      assertionIdentity({ kind: "TOOL_CALLED", tool: "b" }),
    );
  });
});
