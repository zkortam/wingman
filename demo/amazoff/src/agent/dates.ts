const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/**
 * Reads a delivery date out of what the customer typed.
 *
 * The demo invites people to type freely, so this covers the phrasings a person
 * actually uses for a delivery date and returns null rather than guessing otherwise.
 * Dates are handled in UTC because the whole demo runs on ISO day strings.
 */
export function resolveDate(utterance: string, today: string): string | null {
  const text = utterance.toLowerCase();

  const explicit = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (explicit?.[1]) return explicit[1];

  const base = new Date(`${today}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;

  if (/\btomorrow\b/.test(text)) return addDays(base, 1);
  if (/\bnext week\b/.test(text)) return addDays(base, 7);
  if (/\b(a day later|push .*back a day|one day later)\b/.test(text)) return addDays(base, 1);

  for (const [index, weekday] of WEEKDAYS.entries()) {
    if (!new RegExp(`\\b${weekday}\\b`).test(text)) continue;
    const ahead = (index - base.getUTCDay() + 7) % 7;
    return addDays(base, ahead === 0 ? 7 : ahead);
  }
  return null;
}

function addDays(from: Date, days: number): string {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
