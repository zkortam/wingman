import { SessionInputSchema, type AgentConfig } from "@wingman/schema";
import { describe, expect, it, vi } from "vitest";

import { WingmanClient } from "./index.js";

const baseConfig: AgentConfig = {
  systemPrompt: "Help safely.",
  tools: { lookup: { description: "Look up an order." } },
  retrieval: {},
  rules: [],
};

describe("WingmanClient.observeSession", () => {
  it("sends a strict, locally redacted session with no raw user identity", async () => {
    const bodies: unknown[] = [];
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as unknown);
      return new Response(null, { status: 202 });
    });
    const client = new WingmanClient({
      endpoint: "https://wingman.test",
      apiKey: "key",
      orgId: "5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26",
      orgSalt: "salt",
      signingKey: "signing-key",
      baseConfig,
      defaultAgent: "4ee0d899-d63d-4bc2-b47a-25aa25c6078b",
      writable: ["rules"],
      redact: { fields: ["turns", "lastQuery"] },
      scrubber: {
        scrub: async (value) => value.replaceAll("jane@example.com", "[EMAIL]"),
      },
      fetcher,
    });

    client.observeSession({
      id: "f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6",
      userId: "jane@example.com",
      startedAt: "2026-08-23T20:00:00.000Z",
      lastQuery: "order for jane@example.com",
      telemetry: {
        convention: 'opentelemetry-genai',
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        externalTraceId: 'langfuse-trace-42',
      },
      turns: [
        {
          idx: 0,
          role: "user",
          text: "Find jane@example.com's order",
          toolCalls: [],
          createdAt: "2026-08-23T20:00:00.000Z",
        },
      ],
    });
    await client.flush();

    expect(bodies).toHaveLength(1);
    const payload = SessionInputSchema.parse(bodies[0]);
    expect(payload.userHash).toMatch(/^[a-f0-9]{32}$/);
    expect(payload.turns[0]?.textRedacted).toContain("[EMAIL]");
    expect(payload.lastQuery).toContain("[EMAIL]");
    expect(payload.telemetry).toEqual({
      convention: 'opentelemetry-genai',
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      externalTraceId: 'langfuse-trace-42',
    })
    expect(JSON.stringify(payload)).not.toContain("jane@example.com");
  });

  it("drops invalid observations without throwing into host code", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 202 }));
    const client = new WingmanClient({
      endpoint: "https://wingman.test",
      apiKey: "key",
      orgId: "5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26",
      orgSalt: "salt",
      signingKey: "signing-key",
      baseConfig,
      defaultAgent: "4ee0d899-d63d-4bc2-b47a-25aa25c6078b",
      writable: ["rules"],
      redact: { fields: ["turns"] },
      fetcher,
    });
    expect(() =>
      client.observeSession({
        id: "not-a-uuid",
        userId: "user",
        startedAt: "bad-date",
        turns: [],
      }),
    ).not.toThrow();
    await client.flush();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
