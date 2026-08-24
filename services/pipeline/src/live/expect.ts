import { randomUUID } from 'node:crypto'

import {
  AssertionDefinitionSchema,
  ExpectationSchema,
  type AgentConfig,
  type Expectation,
  type ModelClient,
} from '@wingman/schema'
import { z } from 'zod'

import { PIPELINE_MODELS, PIPELINE_POLICY } from '../policy.js'

export interface FormExpectationInput {
  sessionId: string
  turnIdx: number
  /** Redacted text of the request turn. */
  utterance: string
  config: AgentConfig
  now?: () => string
}

/** Predicts what the agent ought to do with a request, before it does it. */
export async function formExpectation(
  model: ModelClient,
  input: FormExpectationInput,
): Promise<Expectation | null> {
  const raw = await withTimeout(
    model.generate({
      model: PIPELINE_MODELS.expectation,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt(input) },
      ],
    }),
    PIPELINE_POLICY.maxExpectationMs,
  )
  if (raw === TIMED_OUT) return null

  const parsed = ResponseSchema.safeParse(coerce(raw))
  if (!parsed.success) return null
  if (parsed.data.definition === null) return null

  const now = (input.now ?? (() => new Date().toISOString()))()
  const expectation = ExpectationSchema.safeParse({
    id: randomUUID(),
    sessionId: input.sessionId,
    turnIdx: input.turnIdx,
    definition: parsed.data.definition,
    utterance: input.utterance,
    confidence: parsed.data.confidence,
    state: 'PENDING',
    createdAt: now,
    resolvedAt: null,
  })
  return expectation.success ? expectation.data : null
}

const SYSTEM_PROMPT = [
  "You predict what a support agent should do with a customer's request.",
  'Reply with JSON only.',
  '',
  "Name the tool the request needs. If one of the agent's tools fits, use its exact",
  'name. If the request needs a capability the agent does not have, invent a',
  'descriptive snake_case name for it anyway — do not force it onto an unrelated tool.',
  '',
  'If the request is small talk, a thank-you, or a question with no action behind it,',
  'reply {"definition":null,"confidence":0}.',
  '',
  'Otherwise reply {"definition":{"kind":"TOOL_CALLED","tool":"<name>"},"confidence":<0-1>}.',
].join('\n')

function prompt(input: FormExpectationInput): string {
  const tools = Object.entries(input.config.tools)
    .map(([name, tool]) => `- ${name}: ${tool.description}`)
    .join('\n')
  return `Agent tools:\n${tools}\n\nCustomer request:\n${input.utterance}`
}

const ResponseSchema = z.object({
  definition: AssertionDefinitionSchema.nullable(),
  confidence: z.number().min(0).max(1),
})

/** Model transports vary in whether they hand back an object or a JSON string. */
function coerce(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const TIMED_OUT = Symbol('timed-out')

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      work.catch(() => TIMED_OUT as T | typeof TIMED_OUT),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
