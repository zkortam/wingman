import { randomUUID } from "node:crypto";

import {
  AMAZOFF_BASE_CONFIG,
  AMAZOFF_ORDERS,
  AmazoffAgent,
  OrderBook,
  renderPrompt,
  selectTool,
  type Order,
  type ToolSelection,
} from "@demo/amazoff";

import { codexAvailable, codexJson } from "./codex.js";
import {
  classifyTurn,
  detectLiveSignals,
  formExpectation,
  repairForExpectation,
} from "@wingman/pipeline";
import {
  SignalKindSchema,
  type AgentConfig,
  type Expectation,
  type LiveClassification,
  type ModelClient,
  type SignalKind,
  type ToolCall,
} from "@wingman/schema";

/**
 * Runs Amazoff and Wingman side by side in one process so the demo needs no
 * infrastructure. This stands in for Wingman's service; Amazoff itself still only ever
 * talks to the SDK surface.
 */
export interface ChatMessage {
  role: "customer" | "agent";
  text: string;
  tool: string | null;
  /** Set on the message Wingman caused to be replaced. */
  superseded?: boolean;
}

export interface WingmanEvent {
  at: string;
  lane: LiveClassification["lane"];
  headline: string;
  detail: string;
  ruleAdded: string | null;
}

const BASELINES = Object.fromEntries(
  SignalKindSchema.options.map((kind) => [kind, 0]),
) as Record<SignalKind, number>;

/**
 * Predicts the tool a request needs. Stands in for the model call, and is deliberately
 * willing to name a capability Amazoff does not have, because that is what separates a
 * defect from a genuine gap.
 */
// Stems rather than whole words, so "reschedule", "rescheduled" and "rescheduling" all
// match. A trailing word boundary would defeat that.
const INTENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(international|abroad|another country|germany|overseas)/i, "change_shipping_country"],
  [/\b(reschedul|mov|chang|push|delay|postpone|different day|later)/i, "reschedule_delivery"],
  [/\bcancel/i, "cancel_order"],
  [/\breturn/i, "start_return"],
  [/\brefund/i, "issue_refund"],
  [/\b(where|status|track|look up)/i, "get_order"],
];

const keywordModel: ModelClient = {
  generate: (request) => {
    const text = JSON.stringify((request as { messages: unknown[] }).messages);
    const asked = text.slice(text.lastIndexOf("Customer request"));
    for (const [pattern, tool] of INTENTS) {
      if (pattern.test(asked))
        return Promise.resolve({
          definition: { kind: "TOOL_CALLED", tool },
          confidence: 0.9,
        });
    }
    return Promise.resolve({ definition: null, confidence: 0 });
  },
};

const EXPECTATION_SCHEMA = {
  type: "object",
  properties: {
    tool: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
  required: ["tool", "confidence"],
  additionalProperties: false,
};

const SELECTION_SCHEMA = {
  type: "object",
  properties: {
    tool: { type: ["string", "null"] },
    reason: { type: "string" },
  },
  required: ["tool", "reason"],
  additionalProperties: false,
};

/**
 * Wingman's expectation, asked of the real model.
 *
 * It is told to name the capability the request needs even when Amazoff has no such
 * tool, because that is the only thing that later separates a defect from a genuine
 * capability gap.
 */
const codexExpectationModel: ModelClient = {
  generate: async (request) => {
    const messages = (request as { messages: { content: string }[] }).messages
      .map(({ content }) => content)
      .join("\n\n");
    const answer = await codexJson<{ tool: string | null; confidence: number }>(
      `${messages}\n\nName the single tool this request needs. If the agent has no suitable tool, invent a descriptive snake_case name for the missing capability rather than forcing it onto an unrelated tool. Use null only for small talk with no action behind it.`,
      EXPECTATION_SCHEMA,
    );
    if (answer === null) return null;
    return answer.tool === null
      ? { definition: null, confidence: 0 }
      : {
          definition: { kind: "TOOL_CALLED", tool: answer.tool },
          confidence: answer.confidence,
        };
  },
};

const useCodex = process.env.WINGMAN_MODEL !== "keyword" && codexAvailable();
const expectationModel = useCodex ? codexExpectationModel : keywordModel;

export class DemoSession {
  readonly id = randomUUID();
  readonly agentId = randomUUID();
  #orders: OrderBook;
  #agent: AmazoffAgent;
  #config: AgentConfig = AMAZOFF_BASE_CONFIG;
  #messages: ChatMessage[] = [];
  #events: WingmanEvent[] = [];
  #expectation: Expectation | null = null;
  #lastToolCalls: ToolCall[] = [];
  #lastText: string | null = null;

  constructor(readonly customerId = "stevette") {
    this.#orders = new OrderBook(AMAZOFF_ORDERS);
    this.#agent = new AmazoffAgent(this.#orders);
  }

  state() {
    return {
      messages: this.#messages,
      events: this.#events,
      order: this.#orders.forCustomer(this.customerId)[0] ?? null,
      orderEvents: this.#orders.events(),
      rules: this.#config.rules,
      expectation: this.#expectation
        ? { tool: expectedTool(this.#expectation), utterance: this.#expectation.utterance }
        : null,
    };
  }

  reset(): void {
    this.#orders = new OrderBook(AMAZOFF_ORDERS);
    this.#agent = new AmazoffAgent(this.#orders);
    this.#config = AMAZOFF_BASE_CONFIG;
    this.#messages = [];
    this.#events = [];
    this.#expectation = null;
    this.#lastToolCalls = [];
    this.#lastText = null;
  }

  async send(utterance: string): Promise<void> {
    const turnIdx = this.#messages.length;
    this.#messages.push({ role: "customer", text: utterance, tool: null });

    // Signals describe the customer's reaction to what already happened, so they are
    // read before the agent speaks again.
    const signals = detectLiveSignals({
      session: this.#observed(),
      baselines: BASELINES,
      matchingRestart: false,
    });

    const verdict = classifyTurn({
      agentId: this.agentId,
      signals,
      expectation: this.#expectation,
      decision: { toolCalls: this.#lastToolCalls, text: this.#lastText },
      config: this.#config,
      context: { session: {}, user: { rules: [] } },
      utterance,
    });

    if (verdict.lane === "FIX" && this.#expectation !== null) {
      await this.#recover(verdict, utterance);
      return;
    }
    if (verdict.lane === "ALERT") {
      this.#events.push({
        at: now(),
        lane: "ALERT",
        headline: verdict.title,
        detail: verdict.rationale,
        ruleAdded: null,
      });
    }

    const formed = await formExpectation(expectationModel, {
      sessionId: this.id,
      turnIdx,
      utterance,
      config: this.#config,
    });
    if (formed !== null) this.#expectation = formed;

    await this.#respond(utterance);
  }

  /** The recovery: repair the config, then re-run the turn the customer objected to. */
  async #recover(
    verdict: Extract<LiveClassification, { lane: "FIX" }>,
    utterance: string,
  ): Promise<void> {
    const expectation = this.#expectation;
    if (expectation === null) return;
    const repaired = repairForExpectation(this.#config, expectation);
    const tool = expectedTool(expectation);

    if (repaired === null) {
      this.#events.push({
        at: now(),
        lane: "FIX",
        headline: `Cannot repair from config: ${tool ?? "unknown"}`,
        detail: verdict.rationale,
        ruleAdded: null,
      });
      await this.#respond(utterance);
      return;
    }

    const added = repaired.rules[0] ?? null;
    this.#config = repaired;
    const supersede = [...this.#messages].reverse().find((m) => m.role === "agent");
    if (supersede) supersede.superseded = true;

    this.#events.push({
      at: now(),
      lane: "FIX",
      headline: `Wrong tool: expected ${tool ?? "?"}, agent called ${this.#lastToolCalls[0]?.name ?? "nothing"}`,
      detail: verdict.rationale,
      ruleAdded: added,
    });

    // Re-run the original request, not the complaint, since that is what she wanted.
    await this.#respond(expectation.utterance);
  }

  /** The agent's own decision, made by the real model reading its real config. */
  async #modelSelection(utterance: string): Promise<ToolSelection | null> {
    if (!useCodex) return selectTool(utterance, this.#config);
    const answer = await codexJson<{ tool: string | null; reason: string }>(
      renderPrompt(utterance, this.#config),
      SELECTION_SCHEMA,
    );
    if (answer === null || answer.tool === null) return null;
    if (!Object.hasOwn(this.#config.tools, answer.tool)) return null;
    return { tool: answer.tool, reason: "MODEL", rule: answer.reason };
  }

  async #respond(utterance: string): Promise<void> {
    const reply = this.#agent.respond({
      utterance,
      customerId: this.customerId,
      config: this.#config,
      selection: await this.#modelSelection(utterance),
    });
    this.#lastToolCalls = reply.toolCalls;
    this.#lastText = reply.text;
    this.#messages.push({
      role: "agent",
      text: reply.text,
      tool: reply.toolCalls[0]?.name ?? null,
    });
  }

  #observed() {
    return {
      id: this.id,
      orgId: this.agentId,
      agentId: this.agentId,
      userHash: "a".repeat(32),
      taskFingerprint: null,
      startedAt: new Date().toISOString(),
      turns: this.#messages.map((message, idx) => ({
        idx,
        role: message.role === "customer" ? ("user" as const) : ("assistant" as const),
        textRedacted: message.text,
        toolCalls: [],
        createdAt: new Date().toISOString(),
        embedding: null,
      })),
    };
  }
}

function expectedTool(expectation: Expectation): string | null {
  const { definition } = expectation;
  return definition.kind === "OUTPUT_MATCHES_RULE" ? null : definition.tool;
}

function now(): string {
  return new Date().toISOString();
}

export type { Order };
