import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  SessionInputSchema,
  TelemetryCorrelationSchema,
  TurnSchema,
} from "./session.js";

const timestamp = "2026-08-23T20:00:00.000Z";

describe("SessionInputSchema", () => {
  it("accepts a redacted session and rejects missing redaction proof", () => {
    const session = {
      id: randomUUID(),
      orgId: randomUUID(),
      agentId: randomUUID(),
      userHash: "a".repeat(32),
      startedAt: timestamp,
      turns: [
        {
          idx: 0,
          role: "user",
          textRedacted: "Export the filtered view",
          toolCalls: [],
          createdAt: timestamp,
        },
      ],
      redaction: {
        mode: "allowlist",
        fields: ["turns"],
        piiScrubbed: true,
        userIdHashed: true,
      },
    };
    expect(SessionInputSchema.parse(session)).toEqual(session);
    expect(SessionInputSchema.safeParse({ ...session, redaction: undefined }).success).toBe(false);
    expect(SessionInputSchema.safeParse({ ...session, userHash: "not-a-hash" }).success).toBe(false);
  });
});

describe("TurnSchema", () => {
  it("allows proposed tool calls without an id and requires a name", () => {
    expect(
      TurnSchema.parse({
        idx: 0,
        role: "assistant",
        textRedacted: null,
        toolCalls: [{ name: "export_records", args: { filters: { stage: "Negotiation" } } }],
        createdAt: timestamp,
      }).toolCalls[0],
    ).toEqual({ name: "export_records", args: { filters: { stage: "Negotiation" } } });
    expect(
      TurnSchema.safeParse({
        idx: 0,
        role: "user",
        textRedacted: "hi",
        toolCalls: [{ args: {} }],
        createdAt: timestamp,
      }).success,
    ).toBe(false);
  });
});

describe("TelemetryCorrelationSchema", () => {
  it("requires an OpenTelemetry trace id or an external vendor id", () => {
    expect(
      TelemetryCorrelationSchema.parse({
        convention: "opentelemetry-genai",
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
      }).traceId,
    ).toHaveLength(32);
    expect(
      TelemetryCorrelationSchema.parse({
        convention: "posthog-ai",
        externalTraceId: "ph-trace-1",
      }).externalTraceId,
    ).toBe("ph-trace-1");
    expect(
      TelemetryCorrelationSchema.safeParse({ convention: "opentelemetry-genai" }).success,
    ).toBe(false);
  });
});
