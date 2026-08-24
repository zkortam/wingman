import {
  ToolCallReviewDecisionSchema,
  type AgentConfig,
  type ModelClient,
  type ToolCallReviewDecision,
  type ToolCallReviewRequest,
} from "@wingman/schema";
import { z } from "zod";

import { PIPELINE_MODELS, PIPELINE_POLICY } from "../policy.js";

const ModelDecisionSchema = z
  .object({
    action: z.enum(["ALLOW", "RETHINK", "ESCALATE"]),
    reason: z.string().min(1).max(1_000),
    instruction: z.string().min(1).max(2_000).nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

/**
 * Reviews a proposed call but never executes it.
 *
 * The host owns the tool boundary. RETHINK means the host should feed `instruction`
 * back to its agent and ask for another decision; ESCALATE means the host should stop
 * and request human approval. Any unavailable or malformed model response fails open.
 */
export async function reviewProposedToolCall(input: {
  model: ModelClient;
  config: AgentConfig;
  request: ToolCallReviewRequest;
  timeoutMs?: number;
}): Promise<ToolCallReviewDecision> {
  if (!Object.hasOwn(input.config.tools, input.request.proposedCall.name)) {
    return {
      action: "ESCALATE",
      reason: "The proposed tool is absent from the agent's declared configuration.",
      instruction: "Do not execute this call until the tool is explicitly configured.",
      confidence: 1,
      source: "POLICY",
    };
  }

  const raw = await boundedGenerate(input);
  if (raw === null) return unavailableDecision();
  const parsed = ModelDecisionSchema.safeParse(coerce(raw));
  if (!parsed.success) return unavailableDecision();
  const decision = ToolCallReviewDecisionSchema.safeParse({
    ...parsed.data,
    source: "REMOTE",
  });
  return decision.success ? decision.data : unavailableDecision();
}

async function boundedGenerate(input: {
  model: ModelClient;
  config: AgentConfig;
  request: ToolCallReviewRequest;
  timeoutMs?: number;
}): Promise<unknown | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => input.model.generate({
          model: PIPELINE_MODELS.review,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: reviewPrompt(input.config, input.request) },
          ],
        }))
        .catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(
          () => resolve(null),
          input.timeoutMs ?? PIPELINE_POLICY.maxToolReviewMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = [
  "Review one proposed agent tool call before execution.",
  "Return JSON only: action, reason, instruction, confidence.",
  "ALLOW when the call is consistent with the user's latest request and constraints.",
  "RETHINK only for a concrete mismatch in tool choice or arguments.",
  "ESCALATE for destructive ambiguity, unsupported capability, or required approval.",
  "Sentiment is context, never proof of an incorrect call by itself.",
  "For ALLOW set instruction to null. Otherwise give a short instruction to the host agent.",
].join("\n");

function reviewPrompt(
  config: AgentConfig,
  request: ToolCallReviewRequest,
): string {
  return JSON.stringify({
    userMessage: request.userMessage,
    proposedCall: request.proposedCall,
    recentTurns: request.recentTurns,
    context: request.context,
    sentiment: request.sentiment ?? null,
    agent: {
      systemPrompt: config.systemPrompt,
      tools: config.tools,
      rules: config.rules,
    },
  });
}

function coerce(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function unavailableDecision(): ToolCallReviewDecision {
  return {
    action: "ALLOW",
    reason: "Review was unavailable; the host's existing tool policy remains authoritative.",
    instruction: null,
    confidence: 0,
    source: "FAIL_OPEN",
  };
}
