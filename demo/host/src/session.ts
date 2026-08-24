import { randomUUID } from 'node:crypto'

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
} from '@demo/amazoff'

import { wantsRepairedReschedule } from './intents.js'
import { codexJson } from './codex.js'
import {
  baselines,
  expectationModel,
  expectedTool,
  now,
  selectionSchema,
  smallTalk,
  useCodex,
  type ChatMessage,
  type Watch,
  type WingmanEvent,
} from './session-support.js'
import {
  classifyTurn,
  detectLiveSignals,
  formExpectation,
  repairForExpectation,
} from '@wingman/pipeline'
import type { AgentConfig, Expectation, LiveClassification, ToolCall } from '@wingman/schema'

/** Runs the isolated Amazoff integration host and Wingman side by side. */
export class DemoSession {
  readonly id = randomUUID()
  readonly agentId = randomUUID()
  #orders: OrderBook
  #agent: AmazoffAgent
  #config: AgentConfig = AMAZOFF_BASE_CONFIG
  #messages: ChatMessage[] = []
  #events: WingmanEvent[] = []
  #expectation: Expectation | null = null
  #lastToolCalls: ToolCall[] = []
  #lastText: string | null = null
  #queue: Promise<void> = Promise.resolve()
  /** Tools Wingman has already repaired this session. Later paraphrases use them directly. */
  #repairedTools = new Set<string>()
  #watch: Watch = { expected: null, actual: null, matched: null }

  constructor(readonly customerId = 'stevette') {
    this.#orders = new OrderBook(AMAZOFF_ORDERS)
    this.#agent = new AmazoffAgent(this.#orders)
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
    }
  }

  reset(): void {
    this.#orders = new OrderBook(AMAZOFF_ORDERS)
    this.#agent = new AmazoffAgent(this.#orders)
    this.#config = AMAZOFF_BASE_CONFIG
    this.#messages = []
    this.#events = []
    this.#expectation = null
    this.#lastToolCalls = []
    this.#lastText = null
    this.#repairedTools = new Set()
    this.#watch = { expected: null, actual: null, matched: null }
  }

  /** Serializes model calls so concurrent messages cannot corrupt turn order. */
  async send(utterance: string): Promise<void> {
    const queued = this.#queue.then(() => this.#send(utterance))
    this.#queue = queued.catch(() => undefined)
    await queued
  }

  async #send(utterance: string): Promise<void> {
    const turnIdx = this.#messages.length
    this.#messages.push({ role: 'customer', text: utterance, tool: null })

    // Signals describe the customer's reaction to what already happened, so they are read before the.
    const signals = detectLiveSignals({
      session: this.#observed(),
      baselines,
      matchingRestart: false,
    })

    const verdict = classifyTurn({
      agentId: this.agentId,
      signals,
      expectation: this.#expectation,
      decision: { toolCalls: this.#lastToolCalls, text: this.#lastText },
      config: this.#config,
      context: { session: {}, user: { rules: [] } },
      utterance,
    })

    if (verdict.lane === 'FIX' && this.#expectation !== null) {
      await this.#recover(verdict, utterance)
      return
    }
    if (verdict.lane === 'ALERT') {
      this.#events.push({
        at: now(),
        lane: 'ALERT',
        headline: verdict.title,
        detail: verdict.rationale,
        ruleAdded: null,
      })
    }

    // Greetings carry no request, so there is nothing to form an expectation about and no reason to.
    const formed = smallTalk.test(utterance)
      ? null
      : await formExpectation(expectationModel, {
          sessionId: this.id,
          turnIdx,
          utterance,
          config: this.#config,
        })
    if (formed !== null) this.#expectation = formed

    await this.#respond(utterance)
  }

  /** The recovery: repair the config, then re-run the turn the customer objected to. */
  async #recover(
    verdict: Extract<LiveClassification, { lane: 'FIX' }>,
    utterance: string,
  ): Promise<void> {
    const expectation = this.#expectation
    if (expectation === null) return
    const repaired = repairForExpectation(this.#config, expectation)
    const tool = expectedTool(expectation)

    if (repaired === null) {
      this.#events.push({
        at: now(),
        lane: 'FIX',
        headline: `Cannot repair from config: ${tool ?? 'unknown'}`,
        detail: verdict.rationale,
        ruleAdded: null,
      })
      await this.#respond(utterance)
      return
    }

    const added = repaired.rules[0] ?? null
    this.#config = repaired
    if (tool !== null) this.#repairedTools.add(tool)
    const supersede = [...this.#messages].reverse().find((m) => m.role === 'agent')
    if (supersede) supersede.superseded = true

    this.#events.push({
      at: now(),
      lane: 'FIX',
      headline: `Wrong tool: expected ${tool ?? '?'}, agent called ${this.#lastToolCalls[0]?.name ?? 'nothing'}`,
      detail: verdict.rationale,
      ruleAdded: added,
    })

    // Re-run what she wanted.
    const today = new Date().toISOString().slice(0, 10)
    const current = this.#deliveryDate()
    const retry =
      resolveDate(utterance, today, current) !== null ? utterance : expectation.utterance
    await this.#respond(retry, { rescued: true })
  }

  /** The agent's own decision, made by the real model reading its real config. */
  async #modelSelection(utterance: string): Promise<ToolSelection | null> {
    // No point spending seconds on a model call for "hi" or "thanks".
    if (smallTalk.test(utterance)) return null
    // After a live fix, do not ask the model again — it already followed the bad rule once.
    const already = this.#repairedSelection(utterance)
    if (already !== null) return already
    const configured = selectTool(utterance, this.#config)
    // A rule in the config is policy.
    if (configured?.reason === 'RULE') return configured
    if (!useCodex) return configured
    const answer = await codexJson<{ tool: string | null; reason: string }>(
      renderPrompt(utterance, this.#config),
      selectionSchema,
    )
    if (answer === null || answer.tool === null) {
      return resolveSelection(null, configured)
    }
    if (!Object.hasOwn(this.#config.tools, answer.tool)) {
      return resolveSelection(null, configured)
    }
    return resolveSelection({ tool: answer.tool, reason: 'MODEL', rule: answer.reason }, configured)
  }

  #repairedSelection(utterance: string): ToolSelection | null {
    const today = new Date().toISOString().slice(0, 10)
    if (
      this.#repairedTools.has('reschedule_delivery') &&
      wantsRepairedReschedule(utterance, today, this.#deliveryDate())
    ) {
      return { tool: 'reschedule_delivery', reason: 'RULE', rule: null }
    }
    return null
  }

  async #respond(utterance: string, options: { rescued?: boolean } = {}): Promise<void> {
    const previousTool = this.#lastToolCalls[0]?.name ?? null
    const selection = await this.#modelSelection(utterance)
    const reply = this.#agent.respond({
      utterance,
      customerId: this.customerId,
      config: this.#config,
      selection,
    })
    // Small talk and refusals leave the previous decision in place.
    if (reply.toolCalls.length > 0) {
      this.#lastToolCalls = reply.toolCalls
      this.#lastText = reply.text
    }
    if (!smallTalk.test(utterance)) {
      const expected = this.#expectation ? expectedTool(this.#expectation) : null
      const actual = reply.toolCalls[0]?.name ?? null
      this.#watch = {
        expected,
        actual,
        matched: expected === null ? null : expected === actual,
      }
    }
    this.#messages.push({
      role: 'agent',
      text: reply.text,
      tool: reply.toolCalls[0]?.name ?? null,
      reason: selection?.rule ?? null,
      rescued: options.rescued === true,
      replacedTool: options.rescued === true ? previousTool : null,
    })
  }

  #deliveryDate(): string | undefined {
    return this.#orders.forCustomer(this.customerId)[0]?.deliveryDate
  }

  #observed() {
    return {
      id: this.id,
      orgId: this.agentId,
      agentId: this.agentId,
      userHash: 'a'.repeat(32),
      taskFingerprint: null,
      startedAt: new Date().toISOString(),
      turns: this.#messages.map((message, idx) => ({
        idx,
        role: message.role === 'customer' ? ('user' as const) : ('assistant' as const),
        textRedacted: message.text,
        toolCalls: [],
        createdAt: new Date().toISOString(),
        embedding: null,
      })),
    }
  }
}

export type { ChatMessage, Order, Watch, WingmanEvent }
