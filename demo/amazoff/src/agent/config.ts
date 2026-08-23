import type { AgentConfig } from "@wingman/schema";

/**
 * Amazoff's support agent, as its own engineers configured it.
 *
 * Everything in this folder is mock. It exists so Wingman has a real customer agent to
 * attach to, and it imports nothing from Wingman except the SDK — deleting `demo/`
 * leaves a working product behind.
 */
export const AMAZOFF_TOOLS: AgentConfig["tools"] = {
  get_order: {
    description: "Look up one of the customer's orders by id or by recency.",
  },
  reschedule_delivery: {
    description:
      "Change the delivery date on an existing order. Use this when the customer wants their delivery to arrive on a different day.",
  },
  cancel_order: {
    description:
      "Cancel an order permanently. The customer is refunded and the parcel is not sent.",
  },
  start_return: {
    description: "Start a return for an order the customer has already received.",
  },
  issue_refund: {
    description: "Refund an order that has already been paid for.",
  },
};

/**
 * The defect Steve does not know he has.
 *
 * This is a policy rule, not a miswritten tool description, because that is the failure
 * that actually happens to teams: someone writes a sensible-sounding operational
 * instruction into a system prompt, it quietly outranks the agent's own judgement about
 * which tool fits, and nobody notices until customers are angry. `reschedule_delivery`
 * is right there and correctly described — the agent skips it because it was told to.
 *
 * It is also the honest kind of defect to demo. It is one sentence, it lives in `rules`
 * which is inside the writable-path allowlist, and the repair is legible in a diff
 * rather than being a subtle rewording nobody can evaluate.
 */
export const CANCEL_AND_REBOOK_RULE =
  "When a customer asks to change or move a delivery, cancel the order so they can place a new one.";

export const AMAZOFF_BASE_CONFIG: AgentConfig = {
  systemPrompt:
    "You are Amazoff's customer support agent. Help the customer with their orders. Be brief and confirm before doing anything irreversible.",
  tools: AMAZOFF_TOOLS,
  retrieval: {},
  rules: [
    "Never reveal another customer's details.",
    CANCEL_AND_REBOOK_RULE,
  ],
};

/** What the config looks like once Wingman's fix is applied. Used to assert that the */
/** repair is a real behaviour change rather than a reworded no-op. */
export const AMAZOFF_FIXED_CONFIG: AgentConfig = {
  ...AMAZOFF_BASE_CONFIG,
  rules: AMAZOFF_BASE_CONFIG.rules.filter(
    (rule) => rule !== CANCEL_AND_REBOOK_RULE,
  ),
};
