import type { AgentConfig, Expectation } from "@wingman/schema";

import { expectationTool } from "@wingman/schema";

/** Keeps a hotfix from growing without bound across a long conversation. */
export const MAX_CORRECTIVE_RULES = 3;

/**
 * Builds the smallest config change that makes the agent do what was asked.
 *
 * The repair is additive and leaves the customer's own rules untouched. Working out
 * which existing instruction caused the misstep needs analysis Wingman does not have
 * time for while someone waits, and deleting a rule it has not understood is a worse
 * failure than adding one it has. The offending rule is still there; the batch pipeline
 * removes it later, once the variance gate has confirmed the diagnosis.
 *
 * Precedence comes from order, so the corrective rule goes first. It quotes the request
 * verbatim, which makes the trigger match paraphrases of the same ask and makes the diff
 * self-explanatory to whoever reviews it.
 */
export function repairForExpectation(
  config: AgentConfig,
  expectation: Expectation,
): AgentConfig | null {
  const tool = expectationTool(expectation);
  if (tool === null) return null;
  if (!Object.hasOwn(config.tools, tool)) return null;

  const rule = correctiveRule(expectation.utterance, tool);
  if (config.rules.includes(rule)) return null;

  const corrective = config.rules.filter(isCorrective);
  if (corrective.length >= MAX_CORRECTIVE_RULES) return null;

  return { ...structuredClone(config), rules: [rule, ...config.rules] };
}

const PREFIX = "When a customer says";

export function correctiveRule(utterance: string, tool: string): string {
  return `${PREFIX} "${utterance.trim()}", use ${tool}.`;
}

export function isCorrective(rule: string): boolean {
  return rule.startsWith(PREFIX);
}
