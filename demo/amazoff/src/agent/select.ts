import type { AgentConfig } from '@wingman/schema'

/** Picks a tool for an utterance the way a configured agent would. */
export interface ToolSelection {
  tool: string
  reason: 'RULE' | 'DESCRIPTION' | 'FALLBACK' | 'MODEL'
  /** The rule that decided it, so the UI can show the user the actual cause. */
  rule: string | null
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'do',
  'for',
  'from',
  'have',
  'i',
  'if',
  'in',
  'is',
  'it',
  'me',
  'my',
  'need',
  'of',
  'on',
  'or',
  'please',
  'so',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'use',
  'want',
  'when',
  'with',
  'you',
  'your',
])

export function selectTool(utterance: string, config: AgentConfig): ToolSelection | null {
  const tools = Object.keys(config.tools)
  if (tools.length === 0) return null
  const said = terms(utterance)

  const directed = ruleDirectedTool(said, config, tools)
  if (directed !== null) return directed

  const ranked = tools
    .map((tool) => ({
      tool,
      score: overlap(said, describeTool(tool, config)),
    }))
    .sort((left, right) => right.score - left.score)
  const [best, runnerUp] = ranked
  if (best === undefined || best.score === 0) return null
  // A tie is a genuine ambiguity and guessing would make the demo's causality unreadable, so it.
  if (runnerUp !== undefined && runnerUp.score === best.score) return null
  return { tool: best.tool, reason: 'DESCRIPTION', rule: null }
}

/** Rules are policy. */
export function resolveSelection(
  modeled: ToolSelection | null,
  configured: ToolSelection | null,
): ToolSelection | null {
  if (configured?.reason === 'RULE') return configured
  return modeled ?? configured
}

/** A rule applies when its trigger describes what the customer just asked for. */
function ruleDirectedTool(
  said: ReadonlySet<string>,
  config: AgentConfig,
  tools: readonly string[],
): ToolSelection | null {
  for (const rule of config.rules) {
    const named = tools.filter((tool) => mentionIndex(rule, tool) !== null)
    if (named.length !== 1) continue
    const tool = named[0]
    if (tool === undefined) continue
    const at = mentionIndex(rule, tool)
    if (at === null) continue
    const before = terms(rule.slice(0, at))
    // A rule that leads with its action has no trigger clause to test, so fall back to the whole.
    const toolWords = terms(tool.replace(/_/g, ' '))
    const trigger =
      before.size > 0 ? before : new Set([...terms(rule)].filter((word) => !toolWords.has(word)))
    if (overlap(said, trigger) === 0) continue
    return { tool, reason: 'RULE', rule }
  }
  return null
}

/** Where a rule starts naming a tool, or null if it never fully names it. */
function mentionIndex(rule: string, tool: string): number | null {
  const haystack = rule.toLowerCase()
  const literal = haystack.indexOf(tool.toLowerCase())
  if (literal !== -1) return literal

  const words = [...terms(tool.replace(/_/g, ' '))]
  if (words.length === 0) return null
  let earliest = Number.POSITIVE_INFINITY
  for (const word of words) {
    const at = haystack.indexOf(word)
    if (at === -1) return null
    earliest = Math.min(earliest, at)
  }
  return Number.isFinite(earliest) ? earliest : null
}

function describeTool(tool: string, config: AgentConfig): ReadonlySet<string> {
  const description = config.tools[tool]?.description ?? ''
  return terms(`${tool.replace(/_/g, ' ')} ${description}`)
}

function overlap(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0
  for (const word of left) if (right.has(word)) count += 1
  return count
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
      .map(stem),
  )
}

/** Crude, deliberately: enough that "moving" matches "move" without a stemmer dep. */
function stem(word: string): string {
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix))
      return word.slice(0, -suffix.length)
  }
  return word
}
