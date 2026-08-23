import { describe, expect, it } from "vitest";

import { OrderBook, type Order } from "../store/orders.js";
import { AmazoffAgent } from "./agent.js";
import { AMAZOFF_BASE_CONFIG, AMAZOFF_FIXED_CONFIG } from "./config.js";

// 2026-08-23 is a Sunday, so "Friday" resolves to the 28th.
const TODAY = "2026-08-23";

const seed: Order = {
  id: "AMZ-4417",
  customerId: "stevette",
  summary: "Running shoes, size 8",
  deliveryDate: "2026-08-26",
  status: "IN_TRANSIT",
  statusBeforeCancel: null,
};

const setup = () => {
  const orders = new OrderBook([seed], () => `${TODAY}T00:00:00.000Z`);
  return { orders, agent: new AmazoffAgent(orders, () => TODAY) };
};

const ask = (utterance: string, config = AMAZOFF_BASE_CONFIG) => {
  const { orders, agent } = setup();
  return { orders, reply: agent.respond({ utterance, customerId: "stevette", config }) };
};

describe("the moment the demo turns on", () => {
  it("cancels the order when the customer asked to reschedule", () => {
    const { orders, reply } = ask("I need to reschedule my delivery to Friday");
    expect(reply.toolCalls).toEqual([
      { name: "cancel_order", args: { orderId: "AMZ-4417" } },
    ]);
    expect(reply.text).toContain("cancelled");
    expect(orders.get("AMZ-4417")?.status).toBe("CANCELLED");
  });

  it("reschedules to the right date once Wingman has fixed the config", () => {
    const { orders, reply } = ask(
      "I need to reschedule my delivery to Friday",
      AMAZOFF_FIXED_CONFIG,
    );
    expect(reply.toolCalls).toEqual([
      {
        name: "reschedule_delivery",
        args: { orderId: "AMZ-4417", deliveryDate: "2026-08-28" },
      },
    ]);
    expect(orders.get("AMZ-4417")?.deliveryDate).toBe("2026-08-28");
  });
});

describe("recovery inside the same conversation", () => {
  it("undoes the wrong cancel and completes the real request", () => {
    const { orders, agent } = setup();
    // Turn one: the agent gets it wrong, exactly as it does live.
    agent.respond({
      utterance: "I need to reschedule my delivery to Friday",
      customerId: "stevette",
      config: AMAZOFF_BASE_CONFIG,
    });
    expect(orders.get("AMZ-4417")?.status).toBe("CANCELLED");

    // The retry runs against the config Wingman just repaired.
    const retry = agent.respond({
      utterance: "I need to reschedule my delivery to Friday",
      customerId: "stevette",
      config: AMAZOFF_FIXED_CONFIG,
    });

    expect(orders.get("AMZ-4417")).toMatchObject({
      status: "IN_TRANSIT",
      deliveryDate: "2026-08-28",
    });
    expect(retry.text).toContain("reinstated");
  });
});

describe("when Amazoff simply cannot do it", () => {
  it("reports unsupported rather than inventing a tool, which is what raises an alert", () => {
    const { reply } = ask("can you ship this to Germany instead", AMAZOFF_FIXED_CONFIG);
    expect(reply).toMatchObject({ unsupported: true, toolCalls: [] });
  });
});

describe("dates the customer actually types", () => {
  it.each([
    ["move my delivery to tomorrow", "2026-08-24"],
    ["move my delivery to Friday", "2026-08-28"],
    ["move my delivery to 2026-09-01", "2026-09-01"],
    ["push my delivery back a day", "2026-08-24"],
  ])("%s -> %s", (utterance, expected) => {
    const { reply } = ask(utterance, AMAZOFF_FIXED_CONFIG);
    expect(reply.toolCalls[0]?.args).toMatchObject({ deliveryDate: expected });
  });

  it("keeps the existing date when no date was mentioned", () => {
    const { reply } = ask("change my delivery date", AMAZOFF_FIXED_CONFIG);
    expect(reply.toolCalls[0]?.args).toMatchObject({ deliveryDate: "2026-08-26" });
  });
});
