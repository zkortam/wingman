import { expectationTool, type AgentConfig, type Expectation } from '@wingman/schema'

/** Keeps a hotfix from growing without bound across a long conversation. */
export const MAX_CORRECTIVE_RULES = 3

/** Builds the smallest config change that makes the agent do what was asked. */
export function repairForExpectation(
  config: AgentConfig,
  expectation: Expectation,
): AgentConfig | null {
  const tool = expectationTool(expectation)
  if (tool === null) return null
  if (!Object.hasOwn(config.tools, tool)) return null

  const rule = correctiveRule(expectation.utterance, tool)
  if (config.rules.includes(rule)) return null

  const corrective = config.rules.filter(isCorrective)
  if (corrective.length >= MAX_CORRECTIVE_RULES) return null

  return { ...structuredClone(config), rules: [rule, ...config.rules] }
}

const MARKER = 'Correction: '

export function correctiveRule(_utterance: string, tool: string): string {
  return `${MARKER}${situation(tool)}`
}

export function isCorrective(rule: string): boolean {
  return rule.startsWith(MARKER)
}

function situation(tool: string): string {
  if (tool === 'reschedule_delivery') {
    return 'When a customer wants a different delivery date, or to change, move, or reschedule a delivery, use reschedule_delivery.'
  }
  return `When a customer asks about ${tool.replace(/_/g, ' ')}, use ${tool}.`
}
