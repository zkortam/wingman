import {
  JsonObjectSchema,
  type AgentConfig,
  type ModelClient,
  VerdictSchema,
} from "@outcome/schema";
import { z } from "zod";

import type {
  GateDecision,
  IncidentRecord,
  ObservedSession,
} from "../domain.js";
import { PIPELINE_MODELS, PIPELINE_POLICY } from "../policy.js";

const GateResponseSchema = z
  .object({
    verdict: VerdictSchema,
    confidence: z.number().min(0).max(1),
    evidence: JsonObjectSchema,
    policyConflict: z.boolean(),
    refusalReason: z.string().min(1).nullable(),
  })
  .strict();

export interface GateResult {
  decision: GateDecision;
  requiresHumanReview: boolean;
}

export async function runGate(input: {
  model: ModelClient;
  incident: IncidentRecord;
  config: AgentConfig;
  session: ObservedSession;
}): Promise<GateResult> {
  const response = await input.model.generate({
    model: PIPELINE_MODELS.gate,
    messages: orderedEvidence(input),
    tools: [gateToolSchema()],
  });
  const parsed = GateResponseSchema.safeParse(response);
  if (!parsed.success) {
    return {
      decision: {
        verdict: "CONFIG_DEFECT",
        confidence: 0,
        evidence: {
          schemaAmbiguity: parsed.error.issues.map(({ path, code }) => ({
            path,
            code,
          })),
        },
        policyConflict: false,
        refusalReason: "SCHEMA_AMBIGUITY",
      },
      requiresHumanReview: true,
    };
  }
  return {
    decision: parsed.data,
    requiresHumanReview:
      parsed.data.confidence < PIPELINE_POLICY.gateMinimumConfidence ||
      parsed.data.policyConflict,
  };
}

function orderedEvidence(input: {
  incident: IncidentRecord;
  config: AgentConfig;
  session: ObservedSession;
}): unknown[] {
  return [
    { role: "system", content: { policy: input.config.systemPrompt } },
    { role: "system", content: { tools: input.config.tools } },
    {
      role: "system",
      content: { userRules: input.session.userRules ?? input.config.rules },
    },
    { role: "system", content: { successfulTraces: [] } },
    {
      role: "user",
      content: { incidentSessions: input.incident.evidenceExcerpts },
    },
  ];
}

function gateToolSchema(): unknown {
  return {
    name: "classify_outcome",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "verdict",
        "confidence",
        "evidence",
        "policyConflict",
        "refusalReason",
      ],
      properties: {
        verdict: { enum: VerdictSchema.options },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        evidence: { type: "object" },
        policyConflict: { type: "boolean" },
        refusalReason: { type: ["string", "null"] },
      },
    },
  };
}

export { GateResponseSchema };
