import type { AgentConfig } from '@wingman/schema'

import { SupabaseConfigRepository } from './supabase-repository'
import { WingmanConfigStore } from './store'

interface SupabaseStoreOptions {
  fallbackConfigs: ReadonlyMap<string, AgentConfig>
  canonicalize: (value: unknown) => string
}

export class SupabaseConfigStore extends WingmanConfigStore {
  constructor(options: SupabaseStoreOptions) {
    super({ ...options, repository: new SupabaseConfigRepository() })
  }
}

export { ConfigMutationError } from './allowlist'
export { InMemoryConfigRepository } from './repository'
export { WingmanConfigStore, type SignedConfigEnvelope } from './store'
