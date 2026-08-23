import type { PipelineRepository } from "../repository.js";
import type { ReplayDatabase } from "./database.js";
import { createReplayReadRepository } from "./repository-read.js";
import { createReplayWriteRepository } from "./repository-write.js";

export class ReplayPipelineRepository implements PipelineRepository {
  declare getSession: PipelineRepository["getSession"];
  declare getBaselines: PipelineRepository["getBaselines"];
  declare hasMatchingRestart: PipelineRepository["hasMatchingRestart"];
  declare countInFlight: PipelineRepository["countInFlight"];
  declare createOrJoinIncident: PipelineRepository["createOrJoinIncident"];
  declare getIncident: PipelineRepository["getIncident"];
  declare findIncident: PipelineRepository["findIncident"];
  declare updateIncident: PipelineRepository["updateIncident"];
  declare splitIncident: PipelineRepository["splitIncident"];
  declare saveAssertion: PipelineRepository["saveAssertion"];
  declare getAssertion: PipelineRepository["getAssertion"];
  declare listPositiveAssertions: PipelineRepository["listPositiveAssertions"];
  declare saveRun: PipelineRepository["saveRun"];
  declare getBaseVersionId: PipelineRepository["getBaseVersionId"];
  declare saveCandidate: PipelineRepository["saveCandidate"];
  declare getCandidate: PipelineRepository["getCandidate"];
  declare latestCandidate: PipelineRepository["latestCandidate"];
  declare updateCandidate: PipelineRepository["updateCandidate"];
  declare createOutcome: PipelineRepository["createOutcome"];
  declare getOutcomeForIncident: PipelineRepository["getOutcomeForIncident"];
  declare updateOutcome: PipelineRepository["updateOutcome"];
  declare findPendingOutcome: PipelineRepository["findPendingOutcome"];
  declare getSnapshot: PipelineRepository["getSnapshot"];
  declare listSnapshots: PipelineRepository["listSnapshots"];
  declare listOutcomes: PipelineRepository["listOutcomes"];
  declare silentFailureRate: PipelineRepository["silentFailureRate"];
  declare gatePrecision: PipelineRepository["gatePrecision"];
  declare expireIncidents: PipelineRepository["expireIncidents"];
  declare retainEvents: PipelineRepository["retainEvents"];
  declare saveHandoff: PipelineRepository["saveHandoff"];
  declare getHandoff: PipelineRepository["getHandoff"];
  declare getWritableConfigPolicy: PipelineRepository["getWritableConfigPolicy"];
  declare countSignals: PipelineRepository["countSignals"];
  declare getIncidentDiff: PipelineRepository["getIncidentDiff"];

  constructor(database: ReplayDatabase) {
    const read = createReplayReadRepository(database);
    Object.assign(this, read, createReplayWriteRepository(database, read));
  }
}
