import type { AgentConfig, ModelClient } from "@wingman/schema";
import { describe, expect, it } from "vitest";

import { formExpectation } from "./expect.js";

const CONFIG: AgentConfig = {
  systemPrompt: "You are a support agent.",
  tools: {
    reschedule_delivery: { description: "Change the delivery date." },
    cancel_order: { description: "Cancel an order." },
  },
  retrieval: {},
  rules: [],
};

const model = (respond: (request: unknown) => unknown): ModelClient => ({
  generate: (request) => Promise.resolve(respond(request)),
});

const input = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  turnIdx: 0,
  utterance: "I need to reschedule my delivery to Friday",
  config: CONFIG,
  now: () => "2026-08-23T00:00:00.000Z",
};

describe("forming an expectation", () => {
  it("records what the agent should have done", async () => {
    const formed = await formExpectation(
      model(() => ({
        definition: { kind: "TOOL_CALLED", tool: "reschedule_delivery" },
        confidence: 0.9,
      })),
      input,
    );
    expect(formed).toMatchObject({
      definition: { kind: "TOOL_CALLED", tool: "reschedule_delivery" },
      confidence: 0.9,
      state: "PENDING",
      turnIdx: 0,
    });
  });

  it("accepts a JSON string, since transports differ on that", async () => {
    const formed = await formExpectation(
      model(() =>
        JSON.stringify({
          definition: { kind: "TOOL_CALLED", tool: "reschedule_delivery" },
          confidence: 0.8,
        }),
      ),
      input,
    );
    expect(formed?.definition).toEqual({
      kind: "TOOL_CALLED",
      tool: "reschedule_delivery",
    });
  });

  it("keeps a tool the agent does not have, which is what makes an alert possible", async () => {
    // Coercing this onto a configured tool would turn every capability gap into
    // either a false repair or silence.
    const formed = await formExpectation(
      model(() => ({
        definition: { kind: "TOOL_CALLED", tool: "change_shipping_country" },
        confidence: 0.7,
      })),
      input,
    );
    expect(formed?.definition).toEqual({
      kind: "TOOL_CALLED",
      tool: "change_shipping_country",
    });
  });

  it("forms nothing for a turn with no action behind it", async () => {
    const formed = await formExpectation(
      model(() => ({ definition: null, confidence: 0 })),
      input,
    );
    expect(formed).toBeNull();
  });
});

describe("failing open, because a person is waiting", () => {
  it("returns null when the model throws", async () => {
    const thrower: ModelClient = { generate: () => Promise.reject(new Error("503")) };
    await expect(formExpectation(thrower, input)).resolves.toBeNull();
  });

  it("returns null when the model answers with nonsense", async () => {
    await expect(
      formExpectation(model(() => "not json at all"), input),
    ).resolves.toBeNull();
  });

  it("returns null when the shape is wrong rather than trusting it", async () => {
    await expect(
      formExpectation(
        model(() => ({ definition: { kind: "SOMETHING_ELSE" }, confidence: 0.9 })),
        input,
      ),
    ).resolves.toBeNull();
  });

  it("returns null rather than waiting on a hung model", async () => {
    const hung: ModelClient = { generate: () => new Promise(() => undefined) };
    await expect(formExpectation(hung, input)).resolves.toBeNull();
  });
});

describe("the prompt", () => {
  it("shows the model the tools it can choose from", async () => {
    let seen = "";
    await formExpectation(
      model((request) => {
        const { messages } = request as { messages: { content: string }[] };
        seen = messages.map(({ content }) => content).join("\n");
        return { definition: null, confidence: 0 };
      }),
      input,
    );
    expect(seen).toContain("reschedule_delivery: Change the delivery date.");
    expect(seen).toContain("I need to reschedule my delivery to Friday");
  });
});
