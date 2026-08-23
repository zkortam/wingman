import {
  canonicalJSON,
  type AgentConfig,
  type Assertion,
  type ConfigDiff,
  type Run,
} from "@outcome/schema";

export function fixPrompt(input: {
  writablePaths: string[];
  assertion: Assertion;
  failingRun: Run;
  baseConfig: AgentConfig;
  priorArt: Array<{ summary: string; outcome: string }>;
  priorDiffs: ConfigDiff[];
}): string {
  return [
    "Propose the smallest valid ConfigDiff that makes the assertion pass.",
    'Return only JSON matching {"changes":[{"path":string,"before":json,"after":json}]}.',
    `Writable paths: ${canonicalJSON(input.writablePaths)}`,
    `Assertion: ${canonicalJSON(input.assertion.definition)}`,
    `Failing run: ${canonicalJSON(input.failingRun.results)}`,
    `Base config: ${canonicalJSON(input.baseConfig)}`,
    `Ledger prior art: ${canonicalJSON(input.priorArt)}`,
    `Rejected prior diffs: ${canonicalJSON(input.priorDiffs)}`,
  ].join("\n");
}
