export function adjustForBaseline(
  rawConfidence: number,
  baseline: number,
): number {
  return clamp(rawConfidence * (1 - clamp(baseline)));
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
