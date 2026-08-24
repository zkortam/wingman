import type { AgentConfig } from "@wingman/schema";
import { describe, expect, it, vi } from "vitest";

import { WingmanClient, type InitOptions } from "./index.js";

const baseConfig = (): AgentConfig => ({
  systemPrompt: "base",
  tools: {},
  retrieval: {},
  rules: [],
});

const options = (): InitOptions => ({
  endpoint: "https://wingman.test",
  apiKey: "key",
  orgId: "5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26",
  orgSalt: "salt",
  signingKey: "signing-key",
  baseConfig: baseConfig(),
  defaultAgent: "4ee0d899-d63d-4bc2-b47a-25aa25c6078b",
  writable: ["rules"],
  redact: { fields: ["turns"] },
  fetcher: vi.fn(async () => new Response(null, { status: 503 })),
});

describe("WingmanClient initialization", () => {
  it("rejects insecure remote endpoints and empty credentials", () => {
    expect(
      () => new WingmanClient({ ...options(), endpoint: "http://remote.test" }),
    ).toThrow("HTTPS");
    expect(() => new WingmanClient({ ...options(), apiKey: "" })).toThrow();
    expect(() => new WingmanClient({ ...options(), orgSalt: "" })).toThrow();
    expect(() =>
      new WingmanClient({ ...options(), review: { timeoutMs: 0 } }),
    ).toThrow();
    expect(() =>
      new WingmanClient({ ...options(), config: { timeoutMs: 0 } }),
    ).toThrow();
  });

  it("takes a defensive copy of the compiled base config", async () => {
    const base = baseConfig();
    const client = new WingmanClient({ ...options(), baseConfig: base });
    base.rules.push("mutated after init");

    await expect(
      client.config({
        agent: "4ee0d899-d63d-4bc2-b47a-25aa25c6078b",
        userId: "user",
      }),
    ).resolves.toEqual(baseConfig());
  });
});
