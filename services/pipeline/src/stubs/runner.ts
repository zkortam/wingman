import {
  canonicalJSON,
  type AgentRunner,
  type JsonValue,
  type ToolCall,
} from "@outcome/schema";

export interface ReplayDecision {
  toolCalls: ToolCall[];
  text?: string | null;
}

export class StubRunner implements AgentRunner {
  constructor(
    private readonly decide: (
      input: Parameters<AgentRunner["runTurn"]>[0],
    ) => ReplayDecision,
  ) {}

  async runTurn(
    input: Parameters<AgentRunner["runTurn"]>[0],
  ): ReturnType<AgentRunner["runTurn"]> {
    const decision = this.decide(input);
    for (const call of decision.toolCalls) {
      if (input.intercept?.(call) !== "INTERCEPT")
        throw new Error("StubRunner requires interception");
    }
    return {
      toolCalls: structuredClone(decision.toolCalls),
      text: decision.text ?? null,
      cassetteKey: cassetteKey(
        input.config as unknown as JsonValue,
        input.sample ?? 0,
      ),
      toolExecutions: 0,
    };
  }
}

function cassetteKey(config: JsonValue, sample: number): string {
  return `${sample}:${canonicalJSON(config).length}`;
}
