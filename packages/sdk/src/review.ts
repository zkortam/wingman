import {
  ToolCallReviewDecisionSchema,
  ToolCallReviewRequestSchema,
  sessionUuid,
  type ToolCallReviewDecision,
  type ToolCallReviewRequest,
} from '@wingman/schema'

import { classifyStatus, report, type DiagnosticListener } from './diagnostics.js'
import { hashUserId } from './hash.js'
import type { PiiScrubber } from './redaction.js'
import { scrubValue } from './scrub.js'
import { withTimeout } from './timeout.js'

/** Mirrors the wire contract's caps so oversized input is trimmed, not rejected. */
const MAX_RECENT_TURNS = 20
const MAX_USER_MESSAGE_CHARS = 10_000
const CONTEXT_KEYS = new Set(['viewFilters', 'selectedIds', 'dateRange', 'lastQuery'])

export type ReviewToolCallInput = Omit<
  ToolCallReviewRequest,
  'agentId' | 'userHash' | 'userMessage' | 'proposedCall'
> & {
  agent?: string
  userId: string
  userMessage: string
  proposedCall: ToolCallReviewRequest['proposedCall']
}

export type ReviewMcpToolCallInput = Omit<ReviewToolCallInput, 'proposedCall'> & {
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
  if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params))
    return false
  const params = request.params as Record<string, unknown>
  if (typeof params.name !== 'string' || params.name.length === 0) return false
  if (params.arguments === undefined) return true
  return (
    Boolean(params.arguments) &&
    typeof params.arguments === 'object' &&
    !Array.isArray(params.arguments)
  )
}

export type LocalToolCallReviewer = (
  request: ToolCallReviewRequest,
) => Promise<Omit<ToolCallReviewDecision, 'source'>>

export interface ToolReviewOptions {
  failMode?: 'open' | 'closed'
  timeoutMs?: number
  reviewer?: LocalToolCallReviewer
}

interface ToolReviewClientOptions {
  endpoint: string
  apiKey: string
  orgSalt: string
  defaultAgent: string
  declaredTools: string[]
  scrubber: PiiScrubber
  fetcher?: typeof fetch
  review?: ToolReviewOptions
  onDiagnostic?: DiagnosticListener
}

export class ToolReviewClient {
  readonly #options: ToolReviewClientOptions

  constructor(options: ToolReviewClientOptions) {
    this.#options = options
  }

  reviewMcp(input: ReviewMcpToolCallInput): Promise<ToolCallReviewDecision> {
    if (!isMcpToolsCallRequest(input.request)) {
      report(this.#options.onDiagnostic, {
        stage: 'review',
        code: 'INVALID_INPUT',
        message: 'An intercepted MCP tools/call envelope was malformed and could not be reviewed.',
      })
      return Promise.resolve(this.#fallback('MCP tools/call envelope was invalid.'))
    }
    const { request, ...review } = input
    return this.review({
      ...review,
      proposedCall: {
        name: request.params.name,
        args: request.params.arguments ?? {},
      },
    })
  }

  async review(input: ReviewToolCallInput): Promise<ToolCallReviewDecision> {
    if (!this.#options.declaredTools.includes(input.proposedCall.name)) {
      return {
        action: 'ESCALATE',
        reason: "The proposed tool is absent from the agent's declared configuration.",
        instruction: 'Do not execute this call until the tool is explicitly configured.',
        confidence: 1,
        source: 'POLICY',
      }
    }
    const timeoutMs = this.#options.review?.timeoutMs ?? 1_000
    try {
      // The deadline covers redaction as well as the reviewer call.
      return await withTimeout(this.#reviewWithin(input), timeoutMs, 'Review timed out')
    } catch (cause) {
      report(this.#options.onDiagnostic, {
        stage: 'review',
        code:
          cause instanceof Error && /timed out/i.test(cause.message) ? 'TIMEOUT' : 'UNAVAILABLE',
        message: `Review of ${input.proposedCall.name} did not complete.`,
        cause,
        detail: { tool: input.proposedCall.name, timeoutMs },
      })
      return this.#fallback('Review was unavailable.')
    }
  }

  async #reviewWithin(input: ReviewToolCallInput): Promise<ToolCallReviewDecision> {
    const request = await this.#request(input)
    if (request === null) return this.#fallback('Review input was invalid.')
    const raw = this.#options.review?.reviewer
      ? await this.#local(request)
      : await this.#remote(request)
    return this.#decision(raw)
  }

  async #request(input: ReviewToolCallInput): Promise<ToolCallReviewRequest | null> {
    const scrub = (value: unknown): Promise<unknown> =>
      scrubValue(value, (text) => this.#options.scrubber.scrub(text))

    // Oversized input is trimmed rather than rejected.
    const recentTurns = input.recentTurns.slice(-MAX_RECENT_TURNS)
    if (recentTurns.length < input.recentTurns.length) {
      report(this.#options.onDiagnostic, {
        stage: 'review',
        code: 'INVALID_INPUT',
        message: `recentTurns was truncated from ${String(input.recentTurns.length)} to the newest ${String(MAX_RECENT_TURNS)} turns.`,
        detail: { supplied: input.recentTurns.length, limit: MAX_RECENT_TURNS },
      })
    }
    const userMessage = input.userMessage.slice(0, MAX_USER_MESSAGE_CHARS)
    const context = this.#context(input.context)

    const candidate = {
      agentId: input.agent ?? this.#options.defaultAgent,
      sessionId: sessionUuid(input.sessionId),
      userHash: hashUserId(this.#options.orgSalt, input.userId),
      userMessage: await this.#options.scrubber.scrub(userMessage),
      proposedCall: {
        ...input.proposedCall,
        args: await scrub(input.proposedCall.args),
      },
      recentTurns: await Promise.all(
        recentTurns.map(async (turn) => ({
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
      context: await scrub(context),
      ...(input.sentiment === undefined ? {} : { sentiment: input.sentiment }),
    }
    const parsed = ToolCallReviewRequestSchema.safeParse(candidate)
    if (parsed.success) return parsed.data
    report(this.#options.onDiagnostic, {
      stage: 'review',
      code: 'INVALID_INPUT',
      message: `The review request for ${input.proposedCall.name} failed contract validation, so the call was not reviewed.`,
      detail: {
        tool: input.proposedCall.name,
        issues: parsed.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
      },
    })
    return null
  }

  /** Drops context keys the wire contract does not carry, and says which. */
  #context(context: ReviewToolCallInput['context']): ReviewToolCallInput['context'] {
    if (!context || typeof context !== 'object') return context
    const entries = Object.entries(context as Record<string, unknown>)
    const unknown = entries.filter(([key]) => !CONTEXT_KEYS.has(key)).map(([key]) => key)
    if (unknown.length === 0) return context
    report(this.#options.onDiagnostic, {
      stage: 'review',
      code: 'INVALID_INPUT',
      message: `Context keys not carried by the review contract were dropped: ${unknown.join(', ')}.`,
      detail: { dropped: unknown, supported: [...CONTEXT_KEYS] },
    })
    return Object.fromEntries(
      entries.filter(([key]) => CONTEXT_KEYS.has(key)),
    ) as ReviewToolCallInput['context']
  }

  async #local(request: ToolCallReviewRequest): Promise<unknown> {
    const reviewer = this.#options.review?.reviewer
    if (!reviewer) return null
    return withTimeout(
      reviewer(request),
      this.#options.review?.timeoutMs ?? 1_000,
      'Review timed out',
    )
  }

  async #remote(request: ToolCallReviewRequest): Promise<unknown> {
    const fetcher = this.#options.fetcher ?? fetch
    const timeoutMs = this.#options.review?.timeoutMs ?? 1_000
    const url = new URL('v1/reviews/tool-calls', `${this.#options.endpoint}/`).toString()
    const response = await withTimeout(
      fetcher(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.#options.apiKey}`,
          'content-type': 'application/json',
          ...(this.#options.review?.failMode === 'closed'
            ? { 'x-wingman-fail-mode': 'closed' }
            : {}),
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs),
      }),
      timeoutMs,
      'Review timed out',
    )
    if (!response.ok) {
      const code = classifyStatus(response.status)
      report(this.#options.onDiagnostic, {
        stage: 'review',
        code,
        message:
          code === 'UNAUTHORIZED'
            ? `Review credentials were rejected (${String(response.status)}). Wingman is not reviewing tool calls.`
            : `Review returned ${String(response.status)}.`,
        detail: { status: response.status, tool: request.proposedCall.name },
      })
      return null
    }
    return response.json()
  }

  #decision(raw: unknown): ToolCallReviewDecision {
    if (!raw || typeof raw !== 'object') {
      return this.#fallback('Review returned an invalid decision.')
    }
    const value = raw as Record<string, unknown>
    if (value.source === 'FAIL_OPEN' && this.#options.review?.failMode === 'closed') {
      return this.#fallback('Remote review was unavailable.')
    }
    const source =
      value.source === 'FAIL_OPEN' || value.source === 'FAIL_CLOSED' || value.source === 'POLICY'
        ? value.source
        : this.#options.review?.reviewer
          ? 'LOCAL'
          : 'REMOTE'
    const parsed = ToolCallReviewDecisionSchema.safeParse({ ...value, source })
    if (parsed.success) return parsed.data
    report(this.#options.onDiagnostic, {
      stage: 'review',
      code: 'INVALID_RESPONSE',
      message: 'A review decision did not match the contract and was discarded.',
      detail: {
        issues: parsed.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
      },
    })
    return this.#fallback('Review returned an invalid decision.')
  }

  #fallback(reason: string): ToolCallReviewDecision {
    if (this.#options.review?.failMode === 'closed') {
      return {
        action: 'ESCALATE',
        reason,
        instruction: 'Do not execute this call until the host can review it.',
        confidence: 0,
        source: 'FAIL_CLOSED',
      }
    }
    return {
      action: 'ALLOW',
      reason: `${reason} The host's existing tool policy remains authoritative.`,
      instruction: null,
      confidence: 0,
      source: 'FAIL_OPEN',
    }
  }
}
