import type { Database, Json, ServiceClient } from "@outcome/db";

import type { IncidentRecord } from "../domain.js";
import type {
  IncidentPatch,
  PipelineRepository,
  RunInput,
} from "../repository.js";
import type { Row } from "./mappers.js";

type DatabaseUpdate<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Update"];

export function toIncidentUpdate(
  patch: IncidentPatch,
): DatabaseUpdate<"incidents"> {
  const update: DatabaseUpdate<"incidents"> = {};
  if (patch.state !== undefined) update.state = patch.state;
  if (patch.stateReason !== undefined) update.state_reason = patch.stateReason;
  if (patch.attempt !== undefined) update.attempt = patch.attempt;
  if (patch.verdict !== undefined) update.verdict = patch.verdict;
  if (patch.verdictConfidence !== undefined)
    update.verdict_confidence = patch.verdictConfidence;
  if (patch.verdictEvidence !== undefined)
    update.verdict_evidence = patch.verdictEvidence as Json | null;
  if (patch.assertionId !== undefined) update.assertion_id = patch.assertionId;
  return update;
}

export function toCandidateUpdate(
  patch: Parameters<PipelineRepository["updateCandidate"]>[1],
): DatabaseUpdate<"candidates"> {
  const update: DatabaseUpdate<"candidates"> = { state: patch.state };
  if (patch.rejectedReason !== undefined)
    update.rejected_reason = patch.rejectedReason;
  if (patch.newVersionId !== undefined)
    update.new_version_id = patch.newVersionId;
  return update;
}

export function toOutcomeUpdate(
  patch: Parameters<PipelineRepository["updateOutcome"]>[1],
): DatabaseUpdate<"outcomes"> {
  const update: DatabaseUpdate<"outcomes"> = { status: patch.status };
  if (patch.confirmedAt !== undefined) update.confirmed_at = patch.confirmedAt;
  if (patch.revertedAt !== undefined) update.reverted_at = patch.revertedAt;
  return update;
}

export async function findRun(
  client: ServiceClient,
  input: RunInput,
): Promise<Row<"runs"> | null> {
  let query = client
    .from("runs")
    .select("*")
    .eq("assertion_id", input.assertionId)
    .eq("phase", input.phase)
    .eq("attempt", input.attempt);
  query =
    input.candidateId === null
      ? query.is("candidate_id", null)
      : query.eq("candidate_id", input.candidateId);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data as Row<"runs"> | null;
}

export function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function uniqueEvidence(
  values: IncidentRecord["evidenceExcerpts"],
): IncidentRecord["evidenceExcerpts"] {
  return [
    ...new Map(
      values.map((value) => [
        `${value.sessionId}:${value.turnIdx}:${value.kind}`,
        value,
      ]),
    ).values(),
  ];
}

export async function checked(
  request: PromiseLike<{ error: unknown }>,
): Promise<void> {
  const { error } = await request;
  if (error) throw error;
}
