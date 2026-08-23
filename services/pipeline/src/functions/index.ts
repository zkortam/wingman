import type { PipelineCommands } from "@outcome/schema";

import type { PipelineEngine } from "../engine.js";
import { runExpirySweep, runRetentionSweep } from "../operations.js";
import type { PipelineRepository } from "../repository.js";

export interface PipelineFunctions {
  onSessionObserved(event: { data: { sessionId: string } }): Promise<void>;
  onConfirmationDue(event: { data: { incidentId: string } }): Promise<void>;
  expirySweep(): Promise<number>;
  retentionSweep(): Promise<number>;
}

export function createPipelineFunctions(input: {
  engine: PipelineEngine;
  commands: PipelineCommands;
  repository: PipelineRepository;
  now?: () => Date;
}): PipelineFunctions {
  const now = input.now ?? (() => new Date());
  return {
    async onSessionObserved(event) {
      await input.engine.observeSession(event.data.sessionId);
    },
    async onConfirmationDue(event) {
      await input.commands.evaluateConfirmation(event.data.incidentId);
    },
    expirySweep() {
      return runExpirySweep(input.repository, now());
    },
    retentionSweep() {
      return runRetentionSweep(input.repository, now());
    },
  };
}
