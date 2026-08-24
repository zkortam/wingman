import type { ServiceClient } from "@wingman/db";

import type { PipelineRepository } from "../repository.js";
import { createReadStore } from "./read.js";
import { createWriteStore } from "./write.js";

export function createSupabasePipelineRepository(
  client: ServiceClient,
): PipelineRepository {
  const read = createReadStore(client);
  const write = createWriteStore(client, read);
  return { ...read, ...write };
}
