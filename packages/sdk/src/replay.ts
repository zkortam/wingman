import { createHash, timingSafeEqual } from 'node:crypto'

import {
  AgentReplayRequestSchema,
  AgentReplayResponseSchema,
  type AgentReplayRequest,
  type AgentReplayResponse,
} from '@wingman/schema'

type ReplayInput = Omit<AgentReplayRequest, 'interceptToolCalls'>
type ReplayDecision = Omit<AgentReplayResponse, 'toolExecutions'>

export const createAgentReplayHandler = (options: {
  token: string
  run: (input: ReplayInput) => Promise<ReplayDecision>
}) => {
  if (!options.token.trim()) throw new Error('Replay bearer token is required')
  return async (request: Request): Promise<Response> => {
    if (!authorized(request, options.token)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = AgentReplayRequestSchema.safeParse(payload)
    if (!parsed.success) return Response.json({ error: 'Invalid replay request' }, { status: 400 })
    try {
      const input: ReplayInput = {
        config: parsed.data.config,
        messages: parsed.data.messages,
        ...(parsed.data.context === undefined ? {} : { context: parsed.data.context }),
        ...(parsed.data.sample === undefined ? {} : { sample: parsed.data.sample }),
      }
      const decision = AgentReplayResponseSchema.parse({
        ...await options.run(input),
        toolExecutions: 0,
      })
      return Response.json(decision)
    } catch {
      return Response.json({ error: 'Replay unavailable' }, { status: 503 })
    }
  }
}

const authorized = (request: Request, token: string): boolean => {
  const expected = `Bearer ${token}`
  const actual = request.headers.get('authorization') ?? ''
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(actual), digest(expected))
}

export type { ReplayDecision, ReplayInput }
