import {
  ConfigDiffSchema,
  DiffTooLargeError,
  PathNotWritableError,
  configDiffBytes,
  isConfigPathWritable,
  type ConfigDiff,
} from '@wingman/schema'

export function enforceDiffBounds(input: {
  diff: ConfigDiff
  maxDiffBytes: number
  writablePaths: string[]
}): ConfigDiff {
  const diff = ConfigDiffSchema.parse(input.diff)
  if (configDiffBytes(diff) > input.maxDiffBytes) throw new DiffTooLargeError()
  if (
    diff.changes.some(
      ({ path }) => !input.writablePaths.some((allowed) => isConfigPathWritable(path, allowed)),
    )
  ) {
    throw new PathNotWritableError()
  }
  return diff
}

export function pathMatches(path: string, allowed: string): boolean {
  return isConfigPathWritable(path, allowed)
}
