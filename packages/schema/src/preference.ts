import { z } from 'zod'

import type { AgentConfig } from './config.js'
import { PreferenceStateSchema } from './enums.js'
import { IsoDateTimeSchema } from './time.js'

/** A durable, per-user instruction learned from the conversation. */
export const PreferenceRuleSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    agentId: z.string().uuid(),
    userHash: z.string().regex(/^[a-f0-9]{32}$/),
    /** Imperative and self-contained; appended verbatim to the resolved config. */
    rule: z.string().min(1).max(200),
    sourceSessionId: z.string().uuid(),
    sourceTurnIdx: z.number().int().nonnegative(),
    state: PreferenceStateSchema,
    createdAt: IsoDateTimeSchema,
    revokedAt: IsoDateTimeSchema.nullable(),
  })
  .strict()
export type PreferenceRule = z.infer<typeof PreferenceRuleSchema>

/** Newest wins, so a later "actually do ask me first" supersedes an earlier rule. */
export const MAX_ACTIVE_PREFERENCES = 10

/** Overlay a user's active preferences onto their resolved config. */
export function applyPreferences(
  config: AgentConfig,
  preferences: readonly PreferenceRule[],
): AgentConfig {
  const active = preferences
    .filter(({ state }) => state === 'ACTIVE')
    .slice(-MAX_ACTIVE_PREFERENCES)
    .map(({ rule }) => rule)
  if (active.length === 0) return structuredClone(config)
  const existing = new Set(config.rules)
  return {
    ...structuredClone(config),
    rules: [...config.rules, ...active.filter((rule) => !existing.has(rule))],
  }
}
