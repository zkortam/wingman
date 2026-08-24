import { resolveDate } from "@demo/amazoff";

/**
 * Predicts the capability a request needs. Stands in for the model call, and is
 * deliberately willing to name a capability Amazoff does not have, because that is
 * what separates a defect from a genuine gap.
 *
 * Stems rather than whole words, so "reschedule", "rescheduled" and "rescheduling"
 * all match. A trailing word boundary would defeat that.
 */
const INTENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(international|abroad|another country|germany|overseas)/i, "change_shipping_country"],
  [/\b(address|ship(?:ping)? (?:to|address))\b/i, "change_delivery_address"],
  [/\b(reschedul|mov|chang|push|delay|postpone|different day|later|sooner|earlier|arrive \w)/i, "reschedule_delivery"],
  [/\b(leave|door|porch|neighbou?r|ring the bell|do not ring|don'?t ring|courier note|instructions)\b/i, "set_courier_note"],
  [/\b(human|person|representative|supervisor|callback|speak to|talk to)\b/i, "speak_to_human"],
  [/\bcancel/i, "cancel_order"],
  [/\breturn/i, "start_return"],
  [/\brefund/i, "issue_refund"],
  [/\b(where|track|package|parcel|courier)\b/i, "track_package"],
  [/\b(look up|lookup|status)\b/i, "get_order"],
];

export function expectedIntent(utterance: string): string | null {
  for (const [pattern, tool] of INTENTS) {
    if (pattern.test(utterance)) return tool;
  }
  return null;
}

/**
 * After a live FIX, later paraphrases skip the model so the bad rule cannot win again.
 * Only the date-change family qualifies — "where's my delivery" is tracking, not a retry.
 */
export function wantsRepairedReschedule(
  utterance: string,
  today: string,
  currentDelivery?: string,
): boolean {
  if (resolveDate(utterance, today, currentDelivery) !== null) return true;
  return /\b(reschedul|sooner|earlier|later|postpone|delay|different (day|date)|move\b.*\bdeliver|push\b.*\bdeliver|chang.{0,24}(deliver|date|arriv)|make it)\b/i.test(
    utterance,
  );
}
