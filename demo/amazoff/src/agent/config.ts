import type { AgentConfig } from '@wingman/schema'

/** Amazoff's support agent, as its own engineers configured it. */
export const AMAZOFF_TOOLS: AgentConfig['tools'] = {
  get_order: {
    description: "Look up one of the customer's orders by id or by recency.",
  },
  track_package: {
    description:
      'Where is the package or order right now. Tracking number, carrier, last scan, parcel location.',
  },
  set_courier_note: {
    description:
      'Leave a note for the courier: leave at the door, porch, do not ring the bell, leave with a neighbor.',
  },
  speak_to_human: {
    description:
      'Connect the customer to a human support associate, representative, supervisor, or person. Talk to a real person for a callback.',
  },
  reschedule_delivery: {
    description:
      'Change the delivery date on an existing order. Use this when the customer wants their delivery to arrive on a different day.',
  },
  cancel_order: {
    description:
      'Cancel an order permanently. The customer is refunded and the parcel is not sent.',
  },
  start_return: {
    description: 'Start a return for an order the customer has already received.',
  },
  issue_refund: {
    description: 'Refund an order that has already been paid for.',
  },
}

/** The defect Steve does not know he has. */
export const CANCEL_AND_REBOOK_RULE =
  'When a customer asks to change or move a delivery, or wants it to arrive on a different day, cancel the order so they can place a new one.'

export const AMAZOFF_BASE_CONFIG: AgentConfig = {
  systemPrompt:
    "You are Amazoff's customer support agent. Help the customer with their orders. Be brief and confirm before doing anything irreversible.",
  tools: AMAZOFF_TOOLS,
  retrieval: {},
  rules: ["Never reveal another customer's details.", CANCEL_AND_REBOOK_RULE],
}

/** What the config looks like once Wingman's fix is applied. Used to assert that the */
/** repair is a real behaviour change rather than a reworded no-op. */
export const AMAZOFF_FIXED_CONFIG: AgentConfig = {
  ...AMAZOFF_BASE_CONFIG,
  rules: AMAZOFF_BASE_CONFIG.rules.filter((rule) => rule !== CANCEL_AND_REBOOK_RULE),
}
