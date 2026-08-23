import {
  AssertionDefinitionSchema,
  isDecidableAtToolBoundary,
  StageError,
  type AgentConfig,
  type AssertionDefinition,
  type ModelClient,
} from "@outcome/schema";
import { z } from "zod";

import type { IncidentRecord, ObservedSession } from "../domain.js";
import { PIPELINE_MODELS, PIPELINE_POLICY } from "../policy.js";

const ExecutableAssertionSchema = AssertionDefinitionSchema.refine(
  isDecidableAtToolBoundary,
  {
    message: "Assertion is not decidable at the tool boundary",
  },
);
const AssertionResponseSchema = z
  .object({ assertion: ExecutableAssertionSchema })
  .strict();

export async function generateAssertion(input: {
  model: ModelClient;
  incident: IncidentRecord;
  session: ObservedSession;
  config: AgentConfig;
}): Promise<AssertionDefinition> {
  for (
    let attempt = 0;
    attempt < PIPELINE_POLICY.assertionAttempts;
    attempt += 1
  ) {
    const response = await input.model.generate({
      model: PIPELINE_MODELS.assertion,
      sample: attempt,
      messages: [
        {
          role: "system",
          content:
            "Return one executable negative assertion. Only TOOL_CALLED or TOOL_ARG_EQUALS are accepted.",
        },
        {
          role: "user",
          content: {
            tools: input.config.tools,
            contextReferences: allowedContext(input.session),
            evidence: input.incident.evidenceExcerpts,
          },
        },
      ],
      tools: [assertionToolSchema()],
    });
    const parsed = AssertionResponseSchema.safeParse(response);
    if (parsed.success) return parsed.data.assertion;
  }
  throw new StageError("assertion", "SCHEMA_INVALID", false);
}

function allowedContext(session: ObservedSession): Record<string, boolean> {
  return {
    "session.viewFilters": session.viewFilters !== undefined,
    "session.selectedIds": session.selectedIds !== undefined,
    "session.dateRange": session.dateRange !== undefined,
    "session.lastQuery": session.lastQuery !== undefined,
    "user.rules": (session.userRules?.length ?? 0) > 0,
  };
}

function assertionToolSchema(): unknown {
  return {
    name: "define_assertion",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["assertion"],
      properties: {
        assertion: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "tool"],
              properties: {
                kind: { const: "TOOL_CALLED" },
                tool: { type: "string" },
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "tool", "arg", "expected"],
              properties: {
                kind: { const: "TOOL_ARG_EQUALS" },
                tool: { type: "string" },
                arg: { type: "string" },
                expected: {},
              },
            },
          ],
        },
      },
    },
  };
}

export { AssertionResponseSchema, ExecutableAssertionSchema };
