import type { AgentConfig } from '@outcome/schema'

import { SupabaseConfigRepository } from './supabase-repository'
import { OutcomeConfigStore } from './store'

interface SupabaseStoreOptions {
  fallbackConfigs: ReadonlyMap<string, AgentConfig>
  canonicalize: (value: unknown) => string
}

export class SupabaseConfigStore extends OutcomeConfigStore {
  constructor(options: SupabaseStoreOptions) {
    super({ ...options, repository: new SupabaseConfigRepository() })
  }
}

export { ConfigMutationError } from './allowlist'
export { InMemoryConfigRepository } from './repository'
export { OutcomeConfigStore } from './store'
