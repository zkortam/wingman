import { createDatabase, type Executor } from '@wingman/db'
import type { AgentConfig } from '@wingman/schema'

import { PostgresConfigRepository } from './postgres-repository'
import { WingmanConfigStore } from './store'

interface PostgresStoreOptions {
  fallbackConfigs: ReadonlyMap<string, AgentConfig>
  canonicalize: (value: unknown) => string
  /** Injectable so a test or a host can share one connection. */
  sql?: Executor
}

export class PostgresConfigStore extends WingmanConfigStore {
  constructor(options: PostgresStoreOptions) {
    const { sql, ...rest } = options
    super({ ...rest, repository: new PostgresConfigRepository(sql ?? createDatabase()) })
  }
}

export { ConfigMutationError } from './allowlist'
export { PostgresConfigRepository } from './postgres-repository'
export { InMemoryConfigRepository } from './repository'
export { WingmanConfigStore, type SignedConfigEnvelope } from './store'
