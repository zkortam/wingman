import {
  ConfigDiffSchema,
  DiffTooLargeError,
  PathNotWritableError,
  configDiffBytes,
  type ConfigDiff,
} from "@wingman/schema";

export function enforceDiffBounds(input: {
  diff: ConfigDiff;
  maxDiffBytes: number;
  writablePaths: string[];
}): ConfigDiff {
  const diff = ConfigDiffSchema.parse(input.diff);
  if (configDiffBytes(diff) > input.maxDiffBytes) throw new DiffTooLargeError();
  if (
    diff.changes.some(
      ({ path }) =>
        !input.writablePaths.some((allowed) => pathMatches(path, allowed)),
    )
  ) {
    throw new PathNotWritableError();
  }
  return diff;
}

export function pathMatches(path: string, allowed: string): boolean {
  if (allowed.endsWith(".*")) {
    const prefix = allowed.slice(0, -2);
    return path === prefix || path.startsWith(`${prefix}.`);
  }
  return path === allowed || path.startsWith(`${allowed}.`);
}
