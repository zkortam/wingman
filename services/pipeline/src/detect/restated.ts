const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "the",
  "to",
]);

export function restatedConstraintConfidence(input: {
  finalText: string;
  earlierUserTexts: string[];
  rules: string[];
}): number {
  const finalTokens = tokens(input.finalText);
  if (finalTokens.size < 2) return 0;
  return Math.max(
    0,
    ...[...input.rules, ...input.earlierUserTexts].map((candidate) =>
      overlap(finalTokens, tokens(candidate)),
    ),
  );
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (right.size === 0) return 0;
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared / Math.min(left.size, right.size);
}
