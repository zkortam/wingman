import { z } from "zod";

import {
  AssertionDefinitionSchema,
  evaluateAssertion,
  type AgentDecision,
  type AssertionContext,
} from "./assertion.js";
import type { AgentConfig } from "./config.js";
import { ExpectationStateSchema } from "./enums.js";

/**
 * What Wingman believes the agent should do, formed from the user's request turn
 * and stored before the agent answers.
 *
 * It deliberately reuses AssertionDefinition. An expectation and an assertion are
 * the same statement pointed in opposite directions in time: the assertion is mined
 * from a failure that already happened, the expectation is mined from a request that
 * has not been answered yet. Sharing the shape means `evaluateAssertion` checks both,
 * and an expectation that a user later complains about converts into an assertion for
 * the promotion path without translation.
 *
 * An expectation never blocks or triggers anything on its own. It exists so that when
 * the user does push back, the classifier can tell "you called the wrong tool" apart
 * from "I want shorter answers" apart from "you cannot do this at all" — three states
 * that are indistinguishable from the complaint alone.
 */
export const ExpectationSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    /** The user turn that produced it, so a later complaint can be traced back. */
    turnIdx: z.number().int().nonnegative(),
    definition: AssertionDefinitionSchema,
    /** Redacted user text the expectation was read from. Evidence for the console. */
    utterance: z.string().min(1),
    confidence: z.number().min(0).max(1),
    state: ExpectationStateSchema,
    createdAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable(),
  })
  .strict();
export type Expectation = z.infer<typeof ExpectationSchema>;

/**
 * Whether the agent could possibly satisfy the expectation with the config it has.
 *
 * This is the whole ALERT lane test, and it must run before the FIX lane: an agent that
 * was never given a `create_shipment` tool has not made a mistake, so proposing a config
 * repair for it would be a fabricated fix. A missing tool is a product gap, and the only
 * honest responses are to tell the user and count the demand.
 */
export function isExpectationSupported(
  expectation: Expectation,
  config: AgentConfig,
): boolean {
  const { definition } = expectation;
  if (definition.kind === "OUTPUT_MATCHES_RULE") return true;
  return Object.hasOwn(config.tools, definition.tool);
}

export function isExpectationMet(
  expectation: Expectation,
  decision: AgentDecision,
  context: AssertionContext,
): boolean {
  return evaluateAssertion(expectation.definition, decision, context);
}

/**
 * The tool the expectation is about, or null for output-shape expectations. Used to
 * name the gap in an alert without re-narrowing the union at every call site.
 */
export function expectationTool(expectation: Expectation): string | null {
  const { definition } = expectation;
  return definition.kind === "OUTPUT_MATCHES_RULE" ? null : definition.tool;
}
