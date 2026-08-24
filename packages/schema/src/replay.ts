import { z } from 'zod'

import { AgentConfigSchema } from './config.js'
import { SessionContextSchema, ToolCallSchema, TurnSchema } from './session.js'

export const AgentReplayRequestSchema = z
  .object({
    config: AgentConfigSchema,
    messages: z.array(TurnSchema),
    context: SessionContextSchema.optional(),
    sample: z.number().int().nonnegative().optional(),
    interceptToolCalls: z.literal(true),
  })
  .strict()

export type AgentReplayRequest = z.infer<typeof AgentReplayRequestSchema>

export const AgentReplayResponseSchema = z
  .object({
    toolCalls: z.array(ToolCallSchema),
    text: z.string().nullable(),
    cassetteKey: z.string().min(1),
    toolExecutions: z.literal(0),
  })
  .strict()

export type AgentReplayResponse = z.infer<typeof AgentReplayResponseSchema>
