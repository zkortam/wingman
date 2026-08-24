import {
  isExpectationMet,
  isExpectationSupported,
  expectationTool,
  capabilityKey,
  type AgentConfig,
  type AgentDecision,
  type AssertionContext,
  type Expectation,
  type LiveClassification,
  type Signal,
} from '@wingman/schema'

import { isDurablePreference } from '../detect/preference.js'
import { PIPELINE_POLICY } from '../policy.js'

export interface ClassifyInput {
  agentId: string
  /** Signals detected on the turn the user just sent. */
  signals: readonly Signal[]
  /** The expectation formed from the request turn, if one was formed. */
  expectation: Expectation | null
  /** What the agent actually did on the turn the user is reacting to. */
  decision: AgentDecision | null
  /** The config the agent held at decision time, for the supported/unsupported test. */
  config: AgentConfig
  context: AssertionContext
  /** Redacted text of the user's reaction, used as the preference and alert phrase. */
  utterance: string
}

/** Routes one turn into exactly one lane. */
export function classifyTurn(input: ClassifyInput): LiveClassification {
  const dissatisfaction = strongest(input.signals, [
    'RETRY_REQUEST',
    'RESTATED_CONSTRAINT',
    'ABANDON_RESTART',
  ])
  const preference = strongest(input.signals, ['PREFERENCE_STATED'])

  if (dissatisfaction === null && preference === null) {
    return { lane: 'NONE', rationale: 'No dissatisfaction signal on this turn.' }
  }

  const { expectation } = input
  if (expectation !== null && dissatisfaction !== null) {
    if (!isExpectationSupported(expectation, input.config)) {
      const tool = expectationTool(expectation)
      return {
        lane: 'ALERT',
        expectationId: expectation.id,
        capabilityKey: capabilityKey({
          agentId: input.agentId,
          impliedTool: tool,
          phrase: input.utterance,
        }),
        title: tool === null ? input.utterance : `Missing capability: ${tool}`,
        rationale:
          tool === null
            ? 'The request cannot be satisfied by any configured tool.'
            : `The agent has no ${tool} tool, so there is nothing to repair.`,
        confidence: dissatisfaction.confidence,
      }
    }

    const met =
      input.decision !== null && isExpectationMet(expectation, input.decision, input.context)
    if (!met) {
      return {
        lane: 'FIX',
        expectationId: expectation.id,
        // A tool that exists but was not chosen is reachable from config.
        repairable: true,
        rationale: `Expected ${describe(expectation)} and the agent did not.`,
        confidence: dissatisfaction.confidence,
      }
    }
  }

  if (preference !== null && preference.confidence >= PIPELINE_POLICY.signalMinimumConfidence) {
    // "Keep this one short" is about the current answer; "from now on keep it short" is a rule.
    if (!isDurablePreference(input.utterance)) {
      return {
        lane: 'NONE',
        rationale: 'Style comment scoped to this turn; nothing durable to persist.',
      }
    }
    return {
      lane: 'PERSONALIZE',
      phrase: input.utterance,
      rationale: 'The user stated a durable instruction about how to respond.',
      confidence: preference.confidence,
    }
  }

  return {
    lane: 'NONE',
    rationale:
      expectation === null
        ? 'Dissatisfaction with no expectation to explain it.'
        : 'The expectation was met; nothing to repair.',
  }
}

function strongest(signals: readonly Signal[], kinds: readonly Signal['kind'][]): Signal | null {
  const [best] = signals
    .filter(({ kind }) => kinds.includes(kind))
    .sort((left, right) => right.confidence - left.confidence)
  return best ?? null
}

function describe(expectation: Expectation): string {
  const { definition } = expectation
  switch (definition.kind) {
    case 'TOOL_CALLED':
      return `a ${definition.tool} call`
    case 'TOOL_ARG_EQUALS':
      return `${definition.tool} with ${definition.arg} matching the request`
    case 'OUTPUT_MATCHES_RULE':
      return `an answer satisfying "${definition.rule}"`
  }
}
