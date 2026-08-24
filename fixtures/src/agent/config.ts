interface RuntimeTool {
  name: string
  description: string
}

export interface RuntimeConfig {
  systemPrompt: string
  tools: RuntimeTool[]
  rules: string[]
}

export const BASE_RUNTIME_CONFIG: RuntimeConfig = {
  systemPrompt: 'Help RevOps users work with the CRM. Preserve constraints stated by the user.',
  tools: [
    {
      name: 'search_records',
      description: 'Search CRM opportunities using the supplied query and filters.',
    },
    {
      name: 'export_records',
      description:
        "Export CRM opportunities. Pass the caller's active view filters so the export matches the visible view.",
    },
    { name: 'update_record', description: 'Update one CRM opportunity by id.' },
  ],
  rules: [],
}

const isRuntimeTool = (value: unknown): value is RuntimeTool => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.name === 'string' && typeof candidate.description === 'string'
}

export const runtimeConfig = (value: unknown): RuntimeConfig => {
  if (!value || typeof value !== 'object') return BASE_RUNTIME_CONFIG
  const candidate = value as Record<string, unknown>
  if (typeof candidate.systemPrompt !== 'string') return BASE_RUNTIME_CONFIG
  if (!Array.isArray(candidate.tools) || !candidate.tools.every(isRuntimeTool))
    return BASE_RUNTIME_CONFIG
  if (
    !Array.isArray(candidate.rules) ||
    !candidate.rules.every((rule) => typeof rule === 'string')
  ) {
    return BASE_RUNTIME_CONFIG
  }
  return {
    systemPrompt: candidate.systemPrompt,
    tools: candidate.tools,
    rules: candidate.rules,
  }
}
