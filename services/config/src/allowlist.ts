import {
  ConfigDiffSchema,
  configDiffBytes,
  isConfigPathWritable,
} from '@wingman/schema'

export type ConfigMutationReason = 'PATH_NOT_WRITABLE' | 'DIFF_TOO_LARGE'

export class ConfigMutationError extends Error {
  constructor(readonly reason: ConfigMutationReason) {
    super(reason)
    this.name = 'ConfigMutationError'
  }
}

export const assertWritable = (diff: unknown, writablePaths: string[], maxDiffBytes: number): void => {
  const parsed = ConfigDiffSchema.parse(diff)
  if (configDiffBytes(parsed) > maxDiffBytes) throw new ConfigMutationError('DIFF_TOO_LARGE')
  if (parsed.changes.some(({ path }) => !writablePaths.some((allowed) => isConfigPathWritable(path, allowed)))) {
    throw new ConfigMutationError('PATH_NOT_WRITABLE')
  }
}
