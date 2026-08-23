import { createHash } from "node:crypto";
import { z } from "zod";

import { CapabilityStateSchema } from "./enums.js";

/**
 * Demand for something the agent cannot do.
 *
 * This is the lane with no repair. The agent was never given the tool, so there is no
 * defect and no fix — inventing one would be worse than doing nothing. What is useful
 * is the count: one user asking for international shipping is an anecdote, forty are a
 * roadmap item, and the customer currently has no way to see the difference because
 * these requests die inside individual conversations.
 */
export const CapabilityRequestSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    agentId: z.string().uuid(),
    /** Stable across users and sessions so demand accumulates instead of fragmenting. */
    key: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().min(1),
    /** The tool the user's request implied, when one can be named. */
    impliedTool: z.string().min(1).nullable(),
    /** Distinct requesters. Held as hashes so a count never becomes a customer list. */
    userHashes: z.array(z.string().regex(/^[a-f0-9]{32}$/)),
    sessionIds: z.array(z.string().uuid()),
    evidenceExcerpts: z.array(z.string()),
    state: CapabilityStateSchema,
    firstSeen: z.string().datetime(),
    lastSeen: z.string().datetime(),
  })
  .strict();
export type CapabilityRequest = z.infer<typeof CapabilityRequestSchema>;

/**
 * Distinct users, not distinct requests — one frustrated user asking six times is one
 * unit of demand, and counting attempts instead would let a single loop outrank a
 * genuinely popular gap.
 */
export function capabilityDemand(request: CapabilityRequest): number {
  return new Set(request.userHashes).size;
}

/**
 * Buckets a gap so the same missing capability collides across users.
 *
 * Keyed on the agent and the implied tool rather than on the user's wording, because
 * "ship to Malaysia", "can you post this to KL", and "international delivery?" are one
 * product gap and must not become three roadmap items. When no tool can be named the
 * normalized phrase is the fallback, which buckets less reliably but still beats
 * treating every utterance as unique.
 */
export function capabilityKey(input: {
  agentId: string;
  impliedTool: string | null;
  phrase: string;
}): string {
  const discriminator =
    input.impliedTool ?? input.phrase.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256")
    .update([input.agentId, discriminator].join("|"))
    .digest("hex");
}
