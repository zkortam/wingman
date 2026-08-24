import type { AgentConfig } from "@wingman/schema";
import { describe, expect, it, vi } from "vitest";

import { WingmanClient } from "./index.js";

const config: AgentConfig = {
  systemPrompt: "Help with deliveries.",
  tools: {
    cancel_order: { description: "Cancel an order." },
    reschedule_delivery: { description: "Move a delivery to another date." },
  },
  retrieval: {},
  rules: [],
};

const options = {
  endpoint: "https://wingman.test/",
  apiKey: "key",
  orgId: "5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26",
  orgSalt: "salt",
  signingKey: "signing-key",
  baseConfig: config,
  defaultAgent: "4ee0d899-d63d-4bc2-b47a-25aa25c6078b",
  writable: ["rules"],
  redact: { fields: ["turns", "viewFilters"] },
};

const request = {
  sessionId: "f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6",
  userId: "raw-user@example.com",
  userMessage: "No, move the delivery; do not cancel it.",
  proposedCall: { name: "cancel_order", args: { orderId: "order-1" } },
  recentTurns: [],
  context: {},
};

describe("WingmanClient.reviewToolCall", () => {
  it("redacts identity and returns a validated rethink decision", async () => {
    let sentBody = "";
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      sentBody = String(init?.body);
      return Response.json({
        action: "RETHINK",
        reason: "The user asked to reschedule, not cancel.",
        instruction: "Reconsider the tool choice against the latest correction.",
        confidence: 0.98,
        source: "REMOTE",
      });
    });
    const client = new WingmanClient({ ...options, fetcher });

    const result = await client.reviewToolCall(request);
    expect(result.reason).toBe("The user asked to reschedule, not cancel.");
    expect(result).toMatchObject({
      action: "RETHINK",
      confidence: 0.98,
    });
    expect(sentBody).not.toContain("raw-user@example.com");
    expect(fetcher).toHaveBeenCalledWith(
      "https://wingman.test/v1/reviews/tool-calls",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails open on transport and malformed response failures", async () => {
    const offline = new WingmanClient({
      ...options,
      fetcher: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    await expect(offline.reviewToolCall(request)).resolves.toMatchObject({
      action: "ALLOW",
      source: "FAIL_OPEN",
    });

    const malformed = new WingmanClient({
      ...options,
      fetcher: vi.fn(async () => Response.json({ action: "RETHINK" })),
    });
    await expect(malformed.reviewToolCall(request)).resolves.toMatchObject({
      action: "ALLOW",
      source: "FAIL_OPEN",
    });
  });

  it("supports a fail-closed policy for high-risk hosts", async () => {
    const client = new WingmanClient({
      ...options,
      review: { failMode: "closed" as const },
      fetcher: vi.fn(async () => new Response(null, { status: 503 })),
    });
    await expect(client.reviewToolCall(request)).resolves.toMatchObject({
      action: "ESCALATE",
      source: "FAIL_CLOSED",
    });
  });

  it("does not execute when a fail-closed host receives a remote FAIL_OPEN allow", async () => {
    const client = new WingmanClient({
      ...options,
      review: { failMode: "closed" as const },
      fetcher: vi.fn(async () =>
        Response.json({
          action: "ALLOW",
          reason: "Review was unavailable.",
          instruction: null,
          confidence: 0,
          source: "FAIL_OPEN",
        }),
      ),
    });
    await expect(client.reviewToolCall(request)).resolves.toMatchObject({
      action: "ESCALATE",
      source: "FAIL_CLOSED",
    });
  });

  it("supports an in-process reviewer without exposing raw identity", async () => {
    const reviewer = vi.fn(async (wireRequest) => {
      expect(JSON.stringify(wireRequest)).not.toContain(request.userId);
      return {
        action: "ALLOW" as const,
        reason: "The call matches the latest request.",
        instruction: null,
        confidence: 0.91,
      };
    });
    const fetcher = vi.fn();
    const client = new WingmanClient({
      ...options,
      fetcher,
      review: { reviewer },
    });

    await expect(client.reviewToolCall(request)).resolves.toMatchObject({
      action: "ALLOW",
      source: "LOCAL",
    });
    expect(reviewer).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds a stalled in-process reviewer", async () => {
    const client = new WingmanClient({
      ...options,
      review: {
        timeoutMs: 10,
        reviewer: async () => new Promise(() => undefined),
      },
    });
    const started = performance.now();
    await expect(client.reviewToolCall(request)).resolves.toMatchObject({
      action: "ALLOW",
      source: "FAIL_OPEN",
    });
    expect(performance.now() - started).toBeLessThan(100);
  });

  it("bounds a custom remote transport that ignores abort signals", async () => {
    const client = new WingmanClient({
      ...options,
      review: { timeoutMs: 10 },
      fetcher: async () => new Promise(() => undefined),
    });
    const started = performance.now();
    await expect(client.reviewToolCall(request)).resolves.toMatchObject({
      action: "ALLOW",
      source: "FAIL_OPEN",
    });
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('maps an intercepted MCP tools/call request onto the same review boundary', async () => {
    const reviewer = vi.fn(async (wireRequest) => {
      expect(wireRequest.proposedCall).toEqual({
        name: 'reschedule_delivery',
        args: { date: '2026-09-01' },
      })
      return {
        action: 'ALLOW' as const,
        reason: 'The MCP call matches the corrected request.',
        instruction: null,
        confidence: 0.96,
      }
    })
    const client = new WingmanClient({ ...options, review: { reviewer } })
    await expect(client.reviewMcpToolCall({
      ...request,
      request: {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'reschedule_delivery', arguments: { date: '2026-09-01' } },
      },
    })).resolves.toMatchObject({ action: 'ALLOW', source: 'LOCAL' })
  })

  it('escalates a malformed MCP envelope without calling the model', async () => {
    const reviewer = vi.fn()
    const client = new WingmanClient({
      ...options,
      review: { failMode: 'closed' as const, reviewer },
    })
    await expect(client.reviewMcpToolCall({
      ...request,
      request: { jsonrpc: '1.0', id: 1, method: 'tools/list', params: { name: 'x' } } as never,
    })).resolves.toMatchObject({ action: 'ESCALATE', source: 'FAIL_CLOSED' })
    expect(reviewer).not.toHaveBeenCalled()
  })
});
