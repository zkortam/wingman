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
export function resolveDate(
  utterance: string,
  today: string,
  currentDelivery?: string,
): string | null {
  const text = utterance.toLowerCase();

  const explicit = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (explicit?.[1]) return explicit[1];

  const todayDate = new Date(`${today}T00:00:00.000Z`);
  if (Number.isNaN(todayDate.getTime())) return null;

  const named = monthDay(text, todayDate);
  if (named !== null) return named;

  const anchor = parseDay(currentDelivery) ?? todayDate;

  if (/\btomorrow\b/.test(text)) return addDays(todayDate, 1);
  if (/\bnext week\b/.test(text)) return addDays(todayDate, 7);
  if (/\b(a day later|push .*back a day|one day later)\b/.test(text)) return addDays(anchor, 1);
  // Relative to the existing delivery, so "later" from the 26th is the 28th.
  if (/\b(later|postpone|delay)\b/.test(text)) return addDays(anchor, 2);
  if (/\b(earlier|sooner)\b/.test(text)) return addDays(anchor, -2);

  for (const [index, weekday] of WEEKDAYS.entries()) {
    if (!new RegExp(`\\b${weekday}\\b`).test(text)) continue;
    const ahead = (index - todayDate.getUTCDay() + 7) % 7;
    return addDays(todayDate, ahead === 0 ? 7 : ahead);
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function monthDay(text: string, today: Date): string | null {
  const named = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(
    text,
  );
  if (named?.[1] !== undefined && named[2] !== undefined) {
    const month = MONTHS[named[1]];
    if (month === undefined) return null;
    return utcDate(today.getUTCFullYear(), month, Number(named[2]));
  }
  const numeric = /\b(\d{1,2})\/(\d{1,2})\b/.exec(text);
  if (numeric?.[1] !== undefined && numeric[2] !== undefined) {
    return utcDate(today.getUTCFullYear(), Number(numeric[1]) - 1, Number(numeric[2]));
  }
  return null;
}

function parseDay(value: string | undefined): Date | null {
  if (value === undefined) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcDate(year: number, month: number, day: number): string | null {
  const next = new Date(Date.UTC(year, month, day));
  if (next.getUTCMonth() !== month || next.getUTCDate() !== day) return null;
  return next.toISOString().slice(0, 10);
}

function addDays(from: Date, days: number): string {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
