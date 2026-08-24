import { z } from "zod";

import { SessionContextSchema, ToolCallSchema, TurnSchema } from "./session.js";

export const SentimentLabelSchema = z.enum([
  "CORRECTIVE",
  "FRUSTRATED",
  "ABANDONING",
  "SATISFIED",
  "NEUTRAL",
]);
export type SentimentLabel = z.infer<typeof SentimentLabelSchema>;

export const SentimentEvidenceSchema = z
  .object({
    score: z.number().min(-1).max(1),
    confidence: z.number().min(0).max(1),
    labels: z.array(SentimentLabelSchema).max(5),
  })
  .strict();
export type SentimentEvidence = z.infer<typeof SentimentEvidenceSchema>;

/** The redacted envelope evaluated before a host executes a proposed tool call. */
export const ToolCallReviewRequestSchema = z
  .object({
    agentId: z.string().uuid(),
    sessionId: z.string().uuid(),
    userHash: z.string().regex(/^[a-f0-9]{32}$/),
    userMessage: z.string().min(1).max(10_000),
    proposedCall: ToolCallSchema,
    recentTurns: z.array(TurnSchema).max(20),
    context: SessionContextSchema,
    sentiment: SentimentEvidenceSchema.optional(),
  })
  .strict();
export type ToolCallReviewRequest = z.infer<
  typeof ToolCallReviewRequestSchema
>;

export const ToolCallReviewActionSchema = z.enum([
  "ALLOW",
  "RETHINK",
  "ESCALATE",
]);
export type ToolCallReviewAction = z.infer<
  typeof ToolCallReviewActionSchema
>;

export const ToolCallReviewSourceSchema = z.enum([
  "POLICY",
  "REMOTE",
  "LOCAL",
  "FAIL_OPEN",
  "FAIL_CLOSED",
]);

export const ToolCallReviewDecisionSchema = z
  .object({
    action: ToolCallReviewActionSchema,
    reason: z.string().min(1).max(1_000),
    instruction: z.string().min(1).max(2_000).nullable(),
    confidence: z.number().min(0).max(1),
    source: ToolCallReviewSourceSchema,
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.action === "ALLOW" && decision.instruction !== null) {
      context.addIssue({
        code: "custom",
        path: ["instruction"],
        message: "ALLOW must not include a retry instruction",
      });
    }
    if (decision.action !== "ALLOW" && decision.instruction === null) {
      context.addIssue({
        code: "custom",
        path: ["instruction"],
        message: `${decision.action} requires actionable guidance`,
      });
    }
  });
export type ToolCallReviewDecision = z.infer<
  typeof ToolCallReviewDecisionSchema
>;
