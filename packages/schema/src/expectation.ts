import { z } from 'zod'

import {
  AssertionDefinitionSchema,
  evaluateAssertion,
  type AgentDecision,
  type AssertionContext,
} from './assertion.js'
import type { AgentConfig } from './config.js'
import { ExpectationStateSchema } from './enums.js'
import { IsoDateTimeSchema } from './time.js'

/** What Wingman believes the agent should do, formed from the user's request turn and stored before. */
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
    createdAt: IsoDateTimeSchema,
    resolvedAt: IsoDateTimeSchema.nullable(),
  })
  .strict()
export type Expectation = z.infer<typeof ExpectationSchema>

/** Whether the agent could possibly satisfy the expectation with the config it has. */
export function isExpectationSupported(expectation: Expectation, config: AgentConfig): boolean {
  const { definition } = expectation
  if (definition.kind === 'OUTPUT_MATCHES_RULE') return true
  return Object.hasOwn(config.tools, definition.tool)
}

export function isExpectationMet(
  expectation: Expectation,
  decision: AgentDecision,
  context: AssertionContext,
): boolean {
  return evaluateAssertion(expectation.definition, decision, context)
}

/** The tool the expectation is about, or null for output-shape expectations. */
export function expectationTool(expectation: Expectation): string | null {
  const { definition } = expectation
  return definition.kind === 'OUTPUT_MATCHES_RULE' ? null : definition.tool
}
