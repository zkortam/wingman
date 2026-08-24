import type { AgentConfig } from "@wingman/schema";

import type { ToolSelection } from "./select.js";

/**
 * Asks a language model which tool to call, given the agent's actual config.
 *
 * The config is rendered the way an agent really receives it — system prompt, then rules
 * in priority order, then tools — because the demo's whole claim is that Wingman changes
 * behaviour by changing that text. Rules are numbered so precedence is something the
 * model can act on rather than infer.
 */
export interface ModelSelector {
  (prompt: string): Promise<{ tool: string | null; reason: string } | null>;
}

export async function selectToolViaModel(
  ask: ModelSelector,
  utterance: string,
  config: AgentConfig,
): Promise<ToolSelection | null> {
  const answer = await ask(renderPrompt(utterance, config));
  if (answer === null) return null;
  const { tool } = answer;
  if (tool === null || !Object.hasOwn(config.tools, tool)) return null;
  return { tool, reason: "MODEL", rule: null };
}

export function renderPrompt(utterance: string, config: AgentConfig): string {
  const tools = Object.entries(config.tools)
    .map(([name, tool]) => `- ${name}: ${tool.description}`)
    .join("\n");
  const rules = config.rules
    .map((rule, index) => `${String(index + 1)}. ${rule}`)
    .join("\n");
  return [
    config.systemPrompt,
    "",
    "Rules, in priority order (lower number wins):",
    rules.length > 0 ? rules : "(none)",
    "",
    "Tools you can call:",
    tools,
    "",
    `Customer says: "${utterance}"`,
    "",
    // Without this a real model often reaches for a lookup first, which is sensible
    // behaviour but leaves the turn with nothing to judge. Amazoff wants one decisive
    // action per turn.
    "Rules are binding policy and outrank tool descriptions. If a rule names an action,",
    "take that action even when another tool looks like a better match. Choose the single",
    "tool that follows the rules, then the request. Do not choose a lookup tool unless",
    "the customer asked only for information. Answer null when no tool fits.",
  ].join("\n");
}
