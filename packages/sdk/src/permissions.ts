import {
  configDiffBytes,
  diffConfigs,
  isConfigPathWritable,
  type AgentConfig,
} from '@wingman/schema'

/** The writable-path allowlist and the byte cap are one rule enforced in two places: the control. */
const changePaths = (base: AgentConfig, candidate: AgentConfig): string[] =>
  diffConfigs(base, candidate)?.changes.map(({ path }) => path) ?? []

export const hasOnlyWritableChanges = (
  base: AgentConfig,
  candidate: AgentConfig,
  writablePaths: string[],
): boolean =>
  changePaths(base, candidate).every((path) =>
    writablePaths.some((allowed) => isConfigPathWritable(path, allowed)),
  )

export const configChangeBytes = (base: AgentConfig, candidate: AgentConfig): number => {
  const diff = diffConfigs(base, candidate)
  return diff === null ? 0 : configDiffBytes(diff)
}
