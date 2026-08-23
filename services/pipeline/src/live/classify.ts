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
} from "@outcome/schema";

import { isDurablePreference } from "../detect/preference.js";
import { PIPELINE_POLICY } from "../policy.js";

export interface ClassifyInput {
  agentId: string;
  /** Signals detected on the turn the user just sent. */
  signals: readonly Signal[];
  /** The expectation formed from the request turn, if one was formed. */
  expectation: Expectation | null;
  /** What the agent actually did on the turn the user is reacting to. */
  decision: AgentDecision | null;
  /** The config the agent held at decision time, for the supported/unsupported test. */
  config: AgentConfig;
  context: AssertionContext;
  /** Redacted text of the user's reaction, used as the preference and alert phrase. */
  utterance: string;
}

/**
 * Routes one turn into exactly one lane.
 *
 * Two rules shape this, and both come from the decision not to sit in the request
 * path. Wingman never acts on its own suspicion: an unmet expectation on its own is
 * silent, because the agent taking an unexpected route to a good answer is normal and
 * intervening there would be worse than the occasional miss. The human's
 * dissatisfaction is the trigger, and the expectation is only the evidence that
 * explains which kind of dissatisfaction it is.
 *
 * Precedence is ALERT > FIX > PERSONALIZE. A capability gap outranks a defect because
 * an agent that was never given the tool has not malfunctioned and there is nothing to
 * repair. A defect outranks a preference because a wrong answer is a fact and a verbose
 * one is a taste, and a user who is both wronged and annoyed needs the fact addressed.
 */
export function classifyTurn(input: ClassifyInput): LiveClassification {
  const dissatisfaction = strongest(input.signals, [
    "RETRY_REQUEST",
    "RESTATED_CONSTRAINT",
    "ABANDON_RESTART",
  ]);
  const preference = strongest(input.signals, ["PREFERENCE_STATED"]);

  if (dissatisfaction === null && preference === null) {
    return { lane: "NONE", rationale: "No dissatisfaction signal on this turn." };
  }

  const { expectation } = input;
  if (expectation !== null && dissatisfaction !== null) {
    if (!isExpectationSupported(expectation, input.config)) {
      const tool = expectationTool(expectation);
      return {
        lane: "ALERT",
        expectationId: expectation.id,
        capabilityKey: capabilityKey({
          agentId: input.agentId,
          impliedTool: tool,
          phrase: input.utterance,
        }),
        title: tool === null ? input.utterance : `Missing capability: ${tool}`,
        rationale:
          tool === null
            ? "The request cannot be satisfied by any configured tool."
            : `The agent has no ${tool} tool, so there is nothing to repair.`,
        confidence: dissatisfaction.confidence,
      };
    }

    const met =
      input.decision !== null &&
      isExpectationMet(expectation, input.decision, input.context);
    if (!met) {
      return {
        lane: "FIX",
        expectationId: expectation.id,
        // A tool that exists but was not chosen is reachable from config. Deciding
        // that it is instead a code defect needs the repair attempt to fail first,
        // so that call belongs to the fix agent, not here.
        repairable: true,
        rationale: `Expected ${describe(expectation)} and the agent did not.`,
        confidence: dissatisfaction.confidence,
      };
    }
  }

  if (
    preference !== null &&
    preference.confidence >= PIPELINE_POLICY.signalMinimumConfidence
  ) {
    // "Keep this one short" is about the current answer; "from now on keep it short"
    // is a rule. Persisting the former would reshape every later conversation from a
    // one-off aside, so a non-durable phrasing is left for the host to honour and
    // nothing is written.
    if (!isDurablePreference(input.utterance)) {
      return {
        lane: "NONE",
        rationale: "Style comment scoped to this turn; nothing durable to persist.",
      };
    }
    return {
      lane: "PERSONALIZE",
      phrase: input.utterance,
      rationale: "The user stated a durable instruction about how to respond.",
      confidence: preference.confidence,
    };
  }

  return {
    lane: "NONE",
    rationale:
      expectation === null
        ? "Dissatisfaction with no expectation to explain it."
        : "The expectation was met; nothing to repair.",
  };
}

function strongest(
  signals: readonly Signal[],
  kinds: readonly Signal["kind"][],
): Signal | null {
  const [best] = signals
    .filter(({ kind }) => kinds.includes(kind))
    .sort((left, right) => right.confidence - left.confidence);
  return best ?? null;
}

function describe(expectation: Expectation): string {
  const { definition } = expectation;
  switch (definition.kind) {
    case "TOOL_CALLED":
      return `a ${definition.tool} call`;
    case "TOOL_ARG_EQUALS":
      return `${definition.tool} with ${definition.arg} matching the request`;
    case "OUTPUT_MATCHES_RULE":
      return `an answer satisfying "${definition.rule}"`;
  }
}
