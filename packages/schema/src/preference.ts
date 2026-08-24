import { z } from "zod";

import type { AgentConfig } from "./config.js";
import { PreferenceStateSchema } from "./enums.js";

/**
 * A durable, per-user instruction learned from the conversation.
 *
 * End users of an agent get a one-size-fits-all system prompt; a coding agent gets
 * per-project rules files. This is the missing equivalent. "Stop asking me to confirm"
 * is not a defect to repair and not a capability gap — it is a preference, and today
 * the pipeline detects PREFERENCE and then discards it, so nothing persists.
 *
 * A preference is scoped to one user hash and never promoted globally. That asymmetry
 * is deliberate: a defect is evidence about the agent and should generalise once
 * verified, while a preference is evidence about one person and generalising it would
 * impose their taste on everyone.
 */
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
    createdAt: z.string().datetime(),
    revokedAt: z.string().datetime().nullable(),
  })
  .strict();
export type PreferenceRule = z.infer<typeof PreferenceRuleSchema>;

/** Newest wins, so a later "actually do ask me first" supersedes an earlier rule. */
export const MAX_ACTIVE_PREFERENCES = 10;

/**
 * Overlay a user's active preferences onto their resolved config.
 *
 * Preferences ride in `rules`, which already exists in AgentConfig, is already inside
 * the writable-path allowlist, and is already reachable from an assertion through the
 * `user.rules` context reference. So personalization needs no new delivery mechanism:
 * a preference becomes config, and config already resolves per user, is signed, is
 * versioned, and is revertible.
 */
export function applyPreferences(
  config: AgentConfig,
  preferences: readonly PreferenceRule[],
): AgentConfig {
  const active = preferences
    .filter(({ state }) => state === "ACTIVE")
    .slice(-MAX_ACTIVE_PREFERENCES)
    .map(({ rule }) => rule);
  if (active.length === 0) return structuredClone(config);
  const existing = new Set(config.rules);
  return {
    ...structuredClone(config),
    rules: [...config.rules, ...active.filter((rule) => !existing.has(rule))],
  };
}
