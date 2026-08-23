import {
  evaluateAssertion,
  StageError,
  type AgentRunner,
  type Assertion,
  type AssertionContext,
  type AgentConfig,
  type RunResult,
  type Turn,
} from "@outcome/schema";

import { PIPELINE_POLICY } from "../policy.js";

export interface AssertionRun {
  n: number;
  passCount: number;
  toolExecutions: 0;
  results: RunResult[];
}

export async function runAssertion(input: {
  runner: AgentRunner;
  assertion: Assertion;
  config: AgentConfig;
  messages: Turn[];
  context: AssertionContext;
  samples?: number;
}): Promise<AssertionRun> {
  const n = input.samples ?? PIPELINE_POLICY.verificationSamples;
  const decisions = await Promise.all(
    Array.from({ length: n }, (_, sample) =>
      input.runner.runTurn({
        config: input.config,
        messages: input.messages,
        intercept: () => "INTERCEPT",
        sample,
      }),
    ),
  );
  const toolExecutions = decisions.reduce(
    (total, decision) => total + decision.toolExecutions,
    0,
  );
  if (toolExecutions !== 0)
    throw new StageError("runner", "NOT_ISOLATABLE", false);
  const results = decisions.map((decision) => ({
    passed: evaluateAssertion(
      input.assertion.definition,
      decision,
      input.context,
    ),
    toolCalls: decision.toolCalls,
    text: decision.text,
    cassetteKey: decision.cassetteKey,
  }));
  return {
    n,
    passCount: results.filter(({ passed }) => passed).length,
    toolExecutions: 0,
    results,
  };
}

export { classifyVariance, type VarianceConclusion } from "./variance.js";
