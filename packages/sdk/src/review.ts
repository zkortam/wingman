import {
  ToolCallReviewDecisionSchema,
  ToolCallReviewRequestSchema,
  type ToolCallReviewDecision,
  type ToolCallReviewRequest,
} from "@wingman/schema";

import { hashUserId } from "./hash.js";
import type { PiiScrubber } from "./openredaction.js";
import { scrubValue } from "./scrub.js";
import { withTimeout } from "./timeout.js";

export type ReviewToolCallInput = Omit<
  ToolCallReviewRequest,
  "agentId" | "userHash" | "userMessage" | "proposedCall"
> & {
  agent?: string;
  userId: string;
  userMessage: string;
  proposedCall: ToolCallReviewRequest["proposedCall"];
};

export type ReviewMcpToolCallInput = Omit<
  ReviewToolCallInput,
  'proposedCall'
> & {
  request: McpToolsCallRequest
}

export interface McpToolsCallRequest {
  jsonrpc: '2.0'
  id: string | number
  method: 'tools/call'
  params: {
    name: string
    arguments?: ToolCallReviewRequest['proposedCall']['args']
  }
}

export const isMcpToolsCallRequest = (value: unknown): value is McpToolsCallRequest => {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  if (request.jsonrpc !== '2.0') return false
  if (typeof request.id !== 'string' && typeof request.id !== 'number') return false
  if (request.method !== 'tools/call') return false
  if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) return false
  const params = request.params as Record<string, unknown>
  if (typeof params.name !== 'string' || params.name.length === 0) return false
  if (params.arguments === undefined) return true
  return Boolean(params.arguments) && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
}

export type LocalToolCallReviewer = (
  request: ToolCallReviewRequest,
) => Promise<Omit<ToolCallReviewDecision, "source">>;

export interface ToolReviewOptions {
  failMode?: "open" | "closed";
  timeoutMs?: number;
  reviewer?: LocalToolCallReviewer;
}

interface ToolReviewClientOptions {
  endpoint: string;
  apiKey: string;
  orgSalt: string;
  defaultAgent: string;
  declaredTools: string[];
  scrubber: PiiScrubber;
  fetcher?: typeof fetch;
  review?: ToolReviewOptions;
}

export class ToolReviewClient {
  readonly #options: ToolReviewClientOptions;

  constructor(options: ToolReviewClientOptions) {
    this.#options = options;
  }

  reviewMcp(input: ReviewMcpToolCallInput): Promise<ToolCallReviewDecision> {
    if (!isMcpToolsCallRequest(input.request)) {
      return Promise.resolve(this.#fallback("MCP tools/call envelope was invalid."));
    }
    const { request, ...review } = input;
    return this.review({
      ...review,
      proposedCall: {
        name: request.params.name,
        args: request.params.arguments ?? {},
      },
    });
  }

  async review(input: ReviewToolCallInput): Promise<ToolCallReviewDecision> {
    if (!this.#options.declaredTools.includes(input.proposedCall.name)) {
      return {
        action: "ESCALATE",
        reason: "The proposed tool is absent from the agent's declared configuration.",
        instruction: "Do not execute this call until the tool is explicitly configured.",
        confidence: 1,
        source: "POLICY",
      };
    }
    try {
      const request = await this.#request(input);
      if (request === null) return this.#fallback("Review input was invalid.");
      const raw = this.#options.review?.reviewer
        ? await this.#local(request)
        : await this.#remote(request);
      return this.#decision(raw);
    } catch {
      return this.#fallback("Review was unavailable.");
    }
  }

  async #request(
    input: ReviewToolCallInput,
  ): Promise<ToolCallReviewRequest | null> {
    const scrub = (value: unknown): Promise<unknown> =>
      scrubValue(value, (text) => this.#options.scrubber.scrub(text));
    const candidate = {
      agentId: input.agent ?? this.#options.defaultAgent,
      sessionId: input.sessionId,
      userHash: hashUserId(this.#options.orgSalt, input.userId),
      userMessage: await this.#options.scrubber.scrub(input.userMessage),
      proposedCall: {
        ...input.proposedCall,
        args: await scrub(input.proposedCall.args),
      },
      recentTurns: await Promise.all(
        input.recentTurns.map(async (turn) => ({
          ...turn,
          textRedacted:
            turn.textRedacted === null
              ? null
              : await this.#options.scrubber.scrub(turn.textRedacted),
          toolCalls: await Promise.all(
            turn.toolCalls.map(async (call) => ({
              ...call,
              args: await scrub(call.args),
            })),
          ),
        })),
      ),
      context: await scrub(input.context),
      ...(input.sentiment === undefined ? {} : { sentiment: input.sentiment }),
    };
    const parsed = ToolCallReviewRequestSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }

  async #local(request: ToolCallReviewRequest): Promise<unknown> {
    const reviewer = this.#options.review?.reviewer;
    if (!reviewer) return null;
    return withTimeout(
      reviewer(request),
      this.#options.review?.timeoutMs ?? 1_000,
      "Review timed out",
    );
  }

  async #remote(request: ToolCallReviewRequest): Promise<unknown> {
    const fetcher = this.#options.fetcher ?? fetch;
    const timeoutMs = this.#options.review?.timeoutMs ?? 1_000;
    const response = await withTimeout(
      fetcher(`${this.#options.endpoint}/v1/reviews/tool-calls`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.#options.apiKey}`,
            "content-type": "application/json",
            ...(this.#options.review?.failMode === "closed"
              ? { "x-wingman-fail-mode": "closed" }
              : {}),
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(timeoutMs),
        },
      ),
      timeoutMs,
      "Review timed out",
    );
    if (!response.ok) return null;
    return response.json();
  }

  #decision(raw: unknown): ToolCallReviewDecision {
    if (!raw || typeof raw !== "object") {
      return this.#fallback("Review returned an invalid decision.");
    }
    const value = raw as Record<string, unknown>;
    if (value.source === "FAIL_OPEN" && this.#options.review?.failMode === "closed") {
      return this.#fallback("Remote review was unavailable.");
    }
    const source =
      value.source === "FAIL_OPEN" ||
      value.source === "FAIL_CLOSED" ||
      value.source === "POLICY"
        ? value.source
        : this.#options.review?.reviewer
          ? "LOCAL"
          : "REMOTE";
    const parsed = ToolCallReviewDecisionSchema.safeParse({ ...value, source });
    return parsed.success
      ? parsed.data
      : this.#fallback("Review returned an invalid decision.");
  }

  #fallback(reason: string): ToolCallReviewDecision {
    if (this.#options.review?.failMode === "closed") {
      return {
        action: "ESCALATE",
        reason,
        instruction: "Do not execute this call until the host can review it.",
        confidence: 0,
        source: "FAIL_CLOSED",
      };
    }
    return {
      action: "ALLOW",
      reason: `${reason} The host's existing tool policy remains authoritative.`,
      instruction: null,
      confidence: 0,
      source: "FAIL_OPEN",
    };
  }
}
