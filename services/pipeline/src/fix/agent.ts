import { Codex } from "@openai/codex-sdk";
import { ConfigDiffSchema, StageError, type ConfigDiff } from "@outcome/schema";

import { PIPELINE_MODELS, PIPELINE_POLICY } from "../policy.js";

export interface FixAgent {
  propose(input: {
    prompt: string;
    iteration: number;
    timeoutMs: number;
  }): Promise<ConfigDiff>;
}

export class ReplayFixAgent implements FixAgent {
  constructor(private readonly proposals: ConfigDiff[]) {}

  propose(input: { iteration: number }): Promise<ConfigDiff> {
    const proposal = this.proposals[input.iteration - 1];
    if (proposal === undefined)
      throw new StageError("fix", "ITERATIONS_EXHAUSTED", false);
    return Promise.resolve(ConfigDiffSchema.parse(structuredClone(proposal)));
  }
}

export class CodexFixAgent implements FixAgent {
  private readonly codex: Codex;

  constructor(options: ConstructorParameters<typeof Codex>[0] = {}) {
    this.codex = new Codex(options);
  }

  async propose(input: {
    prompt: string;
    timeoutMs: number;
  }): Promise<ConfigDiff> {
    const thread = this.codex.startThread({
      approvalPolicy: "never",
      networkAccessEnabled: false,
      sandboxMode: "read-only",
      skipGitRepoCheck: true,
      ...(PIPELINE_MODELS.fix === undefined
        ? {}
        : { model: PIPELINE_MODELS.fix }),
    });
    const result = await withTimeout(thread.run(input.prompt), input.timeoutMs);
    return ConfigDiffSchema.parse(parseJson(result.finalResponse));
  }
}

function parseJson(value: string): unknown {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced?.[1] ?? value);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new StageError("fix", "LLM_UNAVAILABLE", true)),
          Math.min(timeoutMs, PIPELINE_POLICY.maxFixTimeMs),
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
