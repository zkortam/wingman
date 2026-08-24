import type { WingmanClient } from "@wingman/sdk";
import type { JsonValue, ToolCallReviewDecision } from "@wingman/schema";

export interface HostToolProposal {
  name: string;
  args?: Record<string, JsonValue>;
}

export interface GuardedToolDecision {
  decision: ToolCallReviewDecision;
  shouldExecute: boolean;
}

/**
 * The host-side tool boundary a customer copies.
 *
 * Review first. Execute only on ALLOW. The SDK never receives an executor.
 */
export async function reviewProposedHostToolCall(input: {
  wingman: Pick<WingmanClient, "reviewToolCall">;
  sessionId: string;
  userId: string;
  userMessage: string;
  proposedCall: HostToolProposal;
  recentTurns?: Parameters<WingmanClient["reviewToolCall"]>[0]["recentTurns"];
  context?: Parameters<WingmanClient["reviewToolCall"]>[0]["context"];
}): Promise<GuardedToolDecision> {
  const decision = await input.wingman.reviewToolCall({
    sessionId: input.sessionId,
    userId: input.userId,
    userMessage: input.userMessage,
    proposedCall: {
      name: input.proposedCall.name,
      args: input.proposedCall.args ?? {},
    },
    recentTurns: input.recentTurns ?? [],
    context: input.context ?? {},
  });
  return {
    decision,
    shouldExecute: decision.action === "ALLOW",
  };
}
