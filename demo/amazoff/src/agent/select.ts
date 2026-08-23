import type { AgentConfig } from "@wingman/schema";

/**
 * Picks a tool for an utterance the way a configured agent would.
 *
 * This is a stand-in for a language model, and the property that matters is not that it
 * is clever but that it is *genuinely driven by the config*. A rule change or a
 * description change has to move the decision, or every fix Wingman claims to verify
 * would be theatre. Swap in a real model through the ModelClient port and the same
 * config text has the same effect for the same reason.
 *
 * Rules outrank tool matching, which is the whole mechanism of the demo's defect. An
 * operational instruction in a system prompt is authoritative, so an agent told to
 * cancel-and-rebook will do that even with a correctly described reschedule tool
 * sitting in front of it.
 */
export interface ToolSelection {
  tool: string;
  reason: "RULE" | "DESCRIPTION" | "FALLBACK";
  /** The rule that decided it, so the UI can show the user the actual cause. */
  rule: string | null;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "for",
  "from",
  "have",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "please",
  "so",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "use",
  "want",
  "when",
  "with",
  "you",
  "your",
]);

export function selectTool(
  utterance: string,
  config: AgentConfig,
): ToolSelection | null {
  const tools = Object.keys(config.tools);
  if (tools.length === 0) return null;
  const said = terms(utterance);

  const directed = ruleDirectedTool(said, config, tools);
  if (directed !== null) return directed;

  const ranked = tools
    .map((tool) => ({
      tool,
      score: overlap(said, describeTool(tool, config)),
    }))
    .sort((left, right) => right.score - left.score);
  const [best, runnerUp] = ranked;
  if (best === undefined || best.score === 0) return null;
  // A tie is a genuine ambiguity and guessing would make the demo's causality
  // unreadable, so it reports nothing rather than picking arbitrarily.
  if (runnerUp !== undefined && runnerUp.score === best.score) return null;
  return { tool: best.tool, reason: "DESCRIPTION", rule: null };
}

/**
 * A rule applies when it talks about what the customer just asked for and names a tool.
 * Matching by the tool's own name words keeps this generic: it reads whatever rules the
 * config happens to carry rather than recognising one hardcoded sentence.
 */
function ruleDirectedTool(
  said: ReadonlySet<string>,
  config: AgentConfig,
  tools: readonly string[],
): ToolSelection | null {
  for (const rule of config.rules) {
    const ruleTerms = terms(rule);
    const named = tools.filter((tool) =>
      terms(tool.replace(/_/g, " ")).size > 0 &&
      [...terms(tool.replace(/_/g, " "))].every((word) => ruleTerms.has(word)),
    );
    if (named.length !== 1) continue;
    const trigger = named[0];
    if (trigger === undefined) continue;
    // The rule has to be about this request, not merely mention a tool. Its overlap
    // with the utterance is measured on the words that are not the tool name, so
    // "cancel the order" does not count as a reason to cancel the order.
    const toolWords = terms(trigger.replace(/_/g, " "));
    const context = new Set(
      [...ruleTerms].filter((word) => !toolWords.has(word)),
    );
    if (overlap(said, context) === 0) continue;
    return { tool: trigger, reason: "RULE", rule };
  }
  return null;
}

function describeTool(tool: string, config: AgentConfig): ReadonlySet<string> {
  const description = config.tools[tool]?.description ?? "";
  return terms(`${tool.replace(/_/g, " ")} ${description}`);
}

function overlap(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const word of left) if (right.has(word)) count += 1;
  return count;
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
      .map(stem),
  );
}

/** Crude, deliberately: enough that "moving" matches "move" without a stemmer dep. */
function stem(word: string): string {
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix))
      return word.slice(0, -suffix.length);
  }
  return word;
}
