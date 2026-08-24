import type { Executor } from '@wingman/db'

import type { PipelineRepository } from '../repository.js'
import { createReadStore } from './read.js'
import { createWriteStore } from './write.js'

export function createPostgresPipelineRepository(sql: Executor): PipelineRepository {
  const read = createReadStore(sql)
  const write = createWriteStore(sql, read)
  return { ...read, ...write }
}
