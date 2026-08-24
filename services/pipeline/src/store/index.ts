import type { ServiceClient } from "@outcome/db";

import type { HandoffRecord } from "../domain.js";
import type { PipelineRepository } from "../repository.js";
import { createReadStore } from "./read.js";
import { createWriteStore } from "./write.js";

export function createSupabasePipelineRepository(
  client: ServiceClient,
): PipelineRepository {
  const handoffs = new Map<string, HandoffRecord>();
  const read = createReadStore(client, handoffs);
  const write = createWriteStore(client, handoffs, read);
  return { ...read, ...write };
}
