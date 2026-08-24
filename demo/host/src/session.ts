import { randomUUID } from "node:crypto";

import {
  AMAZOFF_BASE_CONFIG,
  AMAZOFF_ORDERS,
  AmazoffAgent,
  OrderBook,
  renderPrompt,
  resolveDate,
  resolveSelection,
  selectTool,
  type Order,
  type ToolSelection,
} from "@demo/amazoff";

import { expectedIntent, wantsRepairedReschedule } from "./intents.js";
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
  /** The model's own explanation, shown inside the reasoning dropdown. */
  reason?: string | null;
  /** True when this reply is the retry Wingman just forced. */
  rescued?: boolean;
  /** The tool the agent used before Wingman retried, for the reasoning dropdown. */
  replacedTool?: string | null;
}

export interface WingmanEvent {
  at: string;
  lane: LiveClassification["lane"];
  headline: string;
  detail: string;
  ruleAdded: string | null;
}

export interface Watch {
  expected: string | null;
  actual: string | null;
  matched: boolean | null;
}

const BASELINES = Object.fromEntries(
  SignalKindSchema.options.map((kind) => [kind, 0]),
) as Record<SignalKind, number>;

const keywordModel: ModelClient = {
  generate: (request) => {
    const text = JSON.stringify((request as { messages: unknown[] }).messages);
    const asked = text.slice(text.lastIndexOf("Customer request"));
    const tool = expectedIntent(asked);
    return tool === null
      ? Promise.resolve({ definition: null, confidence: 0 })
      : Promise.resolve({
          definition: { kind: "TOOL_CALLED", tool },
          confidence: 0.9,
        });
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

/** Mirrors the agent's own small-talk test, so both sides skip the model together. */
const SMALL_TALK =
  /^\s*(hi|hey|hello|yo|sup|thanks|thank you|ty|ok|okay|cool|good (morning|afternoon|evening))[\s!.,?]*$/i;

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
  #queue: Promise<void> = Promise.resolve();
  /** Tools Wingman has already repaired this session. Later paraphrases use them directly. */
  #repairedTools = new Set<string>();
  #watch: Watch = { expected: null, actual: null, matched: null };

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
      watch: this.#watch,
      capabilities: Object.keys(this.#config.tools),
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
    this.#repairedTools = new Set();
    this.#watch = { expected: null, actual: null, matched: null };
  }

  /**
   * Turns are processed one at a time. A model call takes seconds, so a second message
   * arriving mid-flight would otherwise interleave its writes with the first and leave
   * Wingman judging the wrong turn.
   */
  async send(utterance: string): Promise<void> {
    const queued = this.#queue.then(() => this.#send(utterance));
    this.#queue = queued.catch(() => undefined);
    await queued;
  }

  async #send(utterance: string): Promise<void> {
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

    // Greetings carry no request, so there is nothing to form an expectation about and
    // no reason to make the customer wait on a model call.
    const formed = SMALL_TALK.test(utterance)
      ? null
      : await formExpectation(expectationModel, {
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
    if (tool !== null) this.#repairedTools.add(tool);
    const supersede = [...this.#messages].reverse().find((m) => m.role === "agent");
    if (supersede) supersede.superseded = true;

    this.#events.push({
      at: now(),
      lane: "FIX",
      headline: `Wrong tool: expected ${tool ?? "?"}, agent called ${this.#lastToolCalls[0]?.name ?? "nothing"}`,
      detail: verdict.rationale,
      ruleAdded: added,
    });

    // Re-run what she wanted. If the complaint itself names a date, that is more
    // specific than the original request and is the one to honour.
    const today = new Date().toISOString().slice(0, 10);
    const current = this.#deliveryDate();
    const retry =
      resolveDate(utterance, today, current) !== null
        ? utterance
        : expectation.utterance;
    await this.#respond(retry, { rescued: true });
  }

  /** The agent's own decision, made by the real model reading its real config. */
  async #modelSelection(utterance: string): Promise<ToolSelection | null> {
    // No point spending seconds on a model call for "hi" or "thanks".
    if (SMALL_TALK.test(utterance)) return null;
    // After a live fix, do not ask the model again — it already followed the bad rule
    // once. A paraphrase like "make it aug 24" would otherwise hit that rule a second time.
    const already = this.#repairedSelection(utterance);
    if (already !== null) return already;
    const configured = selectTool(utterance, this.#config);
    // A rule in the config is policy. Asking the model would let it "helpfully"
    // reschedule and the first demo turn would succeed.
    if (configured?.reason === "RULE") return configured;
    if (!useCodex) return configured;
    const answer = await codexJson<{ tool: string | null; reason: string }>(
      renderPrompt(utterance, this.#config),
      SELECTION_SCHEMA,
    );
    if (answer === null || answer.tool === null) {
      return resolveSelection(null, configured);
    }
    if (!Object.hasOwn(this.#config.tools, answer.tool)) {
      return resolveSelection(null, configured);
    }
    return resolveSelection(
      { tool: answer.tool, reason: "MODEL", rule: answer.reason },
      configured,
    );
  }

  #repairedSelection(utterance: string): ToolSelection | null {
    const today = new Date().toISOString().slice(0, 10);
    if (
      this.#repairedTools.has("reschedule_delivery") &&
      wantsRepairedReschedule(utterance, today, this.#deliveryDate())
    ) {
      return { tool: "reschedule_delivery", reason: "RULE", rule: null };
    }
    return null;
  }

  async #respond(
    utterance: string,
    options: { rescued?: boolean } = {},
  ): Promise<void> {
    const previousTool = this.#lastToolCalls[0]?.name ?? null;
    const selection = await this.#modelSelection(utterance);
    const reply = this.#agent.respond({
      utterance,
      customerId: this.customerId,
      config: this.#config,
      selection,
    });
    // Small talk and refusals leave the previous decision in place. Otherwise saying
    // "hi" between the misstep and the complaint would erase the evidence.
    if (reply.toolCalls.length > 0) {
      this.#lastToolCalls = reply.toolCalls;
      this.#lastText = reply.text;
    }
    if (!SMALL_TALK.test(utterance)) {
      const expected = this.#expectation ? expectedTool(this.#expectation) : null;
      const actual = reply.toolCalls[0]?.name ?? null;
      this.#watch = {
        expected,
        actual,
        matched: expected === null ? null : expected === actual,
      };
    }
    this.#messages.push({
      role: "agent",
      text: reply.text,
      tool: reply.toolCalls[0]?.name ?? null,
      reason: selection?.rule ?? null,
      rescued: options.rescued === true,
      replacedTool: options.rescued === true ? previousTool : null,
    });
  }

  #deliveryDate(): string | undefined {
    return this.#orders.forCustomer(this.customerId)[0]?.deliveryDate;
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
