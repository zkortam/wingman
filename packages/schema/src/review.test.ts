import { describe, expect, it } from "vitest";

import {
  ToolCallReviewDecisionSchema,
  ToolCallReviewRequestSchema,
} from "./review.js";

describe("tool-call review contracts", () => {
  it("accepts a redacted request and rejects raw identity", () => {
    const request = {
      agentId: "4ee0d899-d63d-4bc2-b47a-25aa25c6078b",
      sessionId: "f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6",
      userHash: "a".repeat(32),
      userMessage: "No, move the delivery; do not cancel it.",
      proposedCall: { name: "cancel_order", args: { orderId: "order-1" } },
      recentTurns: [],
      context: {},
    };

    expect(ToolCallReviewRequestSchema.parse(request)).toEqual(request);
    expect(
      ToolCallReviewRequestSchema.safeParse({ ...request, userId: "raw-user" })
        .success,
    ).toBe(false);
  });

  it("requires actionable guidance when a call must be reconsidered", () => {
    expect(
      ToolCallReviewDecisionSchema.safeParse({
        action: "RETHINK",
        reason: "The proposed call contradicts the user's correction.",
        instruction: null,
        confidence: 0.98,
        source: "REMOTE",
      }).success,
    ).toBe(false);
  });

  it("forbids a retry instruction on ALLOW and requires one on ESCALATE", () => {
    expect(
      ToolCallReviewDecisionSchema.safeParse({
        action: "ALLOW",
        reason: "Matches the request.",
        instruction: "Do not retry.",
        confidence: 1,
        source: "REMOTE",
      }).success,
    ).toBe(false);
    expect(
      ToolCallReviewDecisionSchema.parse({
        action: "ESCALATE",
        reason: "Destructive ambiguity.",
        instruction: "Ask a human before executing.",
        confidence: 0.8,
        source: "POLICY",
      }).action,
    ).toBe("ESCALATE");
  });
});

