import {
  ToolCallReviewDecisionSchema,
  ToolCallReviewRequestSchema,
  type ToolCallReviewDecision,
  type ToolCallReviewRequest,
} from "@wingman/schema";

import { hashUserId } from "./hash.js";
import type { PiiScrubber } from "./openredaction.js";

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
  request: {
    jsonrpc: '2.0'
    id: string | number
    method: 'tools/call'
    params: {
      name: string
      arguments?: ToolCallReviewRequest['proposedCall']['args']
    }
  }
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
  scrubber: PiiScrubber;
  fetcher?: typeof fetch;
  review?: ToolReviewOptions;
}

export class ToolReviewClient {
  readonly #options: ToolReviewClientOptions;

  constructor(options: ToolReviewClientOptions) {
    this.#options = options;
  }

  async review(input: ReviewToolCallInput): Promise<ToolCallReviewDecision> {
    try {
      const request = await this.#request(input);
      if (request === null) return this.#fallback("Review input was invalid.");
      const raw = this.#options.review?.reviewer
        ? await this.#local(request)
        : await this.#remote(request);
      const source = this.#options.review?.reviewer ? "LOCAL" : "REMOTE";
      const parsed = ToolCallReviewDecisionSchema.safeParse({
        ...(raw && typeof raw === "object" ? raw : {}),
        source,
      });
      return parsed.success
        ? parsed.data
        : this.#fallback("Review returned an invalid decision.");
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
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(timeoutMs),
        },
      ),
      timeoutMs,
    );
    if (!response.ok) return null;
    return response.json();
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

async function scrubValue(
  value: unknown,
  scrub: (value: string) => Promise<string>,
): Promise<unknown> {
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value))
    return Promise.all(value.map((entry) => scrubValue(entry, scrub)));
  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(
        async ([key, entry]) => [key, await scrubValue(entry, scrub)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Review timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
