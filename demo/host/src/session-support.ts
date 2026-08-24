import { expectedIntent } from './intents.js'
import { codexAvailable, codexJson } from './codex.js'
import {
  SignalKindSchema,
  type Expectation,
  type LiveClassification,
  type ModelClient,
  type SignalKind,
} from '@wingman/schema'

export interface ChatMessage {
  role: 'customer' | 'agent'
  text: string
  tool: string | null
  superseded?: boolean
  reason?: string | null
  rescued?: boolean
  replacedTool?: string | null
}

export interface WingmanEvent {
  at: string
  lane: LiveClassification['lane']
  headline: string
  detail: string
  ruleAdded: string | null
}

export interface Watch {
  expected: string | null
  actual: string | null
  matched: boolean | null
}

export const baselines = Object.fromEntries(
  SignalKindSchema.options.map((kind) => [kind, 0]),
) as Record<SignalKind, number>

const keywordModel: ModelClient = {
  generate: (request) => {
    const text = JSON.stringify((request as { messages: unknown[] }).messages)
    const asked = text.slice(text.lastIndexOf('Customer request'))
    const tool = expectedIntent(asked)
    return tool === null
      ? Promise.resolve({ definition: null, confidence: 0 })
      : Promise.resolve({
          definition: { kind: 'TOOL_CALLED', tool },
          confidence: 0.9,
        })
  },
}

const EXPECTATION_SCHEMA = {
  type: 'object',
  properties: {
    tool: { type: ['string', 'null'] },
    confidence: { type: 'number' },
  },
  required: ['tool', 'confidence'],
  additionalProperties: false,
}

export const selectionSchema = {
  type: 'object',
  properties: {
    tool: { type: ['string', 'null'] },
    reason: { type: 'string' },
  },
  required: ['tool', 'reason'],
  additionalProperties: false,
}

const codexExpectationModel: ModelClient = {
  generate: async (request) => {
    const messages = (request as { messages: { content: string }[] }).messages
      .map(({ content }) => content)
      .join('\n\n')
    const answer = await codexJson<{ tool: string | null; confidence: number }>(
      `${messages}\n\nName the single tool this request needs. If the agent has no suitable tool, invent a descriptive snake_case name for the missing capability rather than forcing it onto an unrelated tool. Use null only for small talk with no action behind it.`,
      EXPECTATION_SCHEMA,
    )
    if (answer === null) return null
    return answer.tool === null
      ? { definition: null, confidence: 0 }
      : {
          definition: { kind: 'TOOL_CALLED', tool: answer.tool },
          confidence: answer.confidence,
        }
  },
}

export const smallTalk =
  /^\s*(hi|hey|hello|yo|sup|thanks|thank you|ty|ok|okay|cool|good (morning|afternoon|evening))[\s!.,?]*$/i

export const useCodex = process.env.WINGMAN_MODEL !== 'keyword' && codexAvailable()
export const expectationModel = useCodex ? codexExpectationModel : keywordModel

export function expectedTool(expectation: Expectation): string | null {
  const { definition } = expectation
  return definition.kind === 'OUTPUT_MATCHES_RULE' ? null : definition.tool
}

export function now(): string {
  return new Date().toISOString()
}
