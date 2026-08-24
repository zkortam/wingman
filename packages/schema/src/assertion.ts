import { z } from "zod";

import {
  JsonPrimitiveSchema,
  type JsonPrimitive,
  type JsonValue,
} from "./json.js";
import type { ToolCall } from "./session.js";

export const ContextPathSchema = z.enum([
  "session.viewFilters",
  "session.selectedIds",
  "session.dateRange",
  "session.lastQuery",
  "user.rules",
]);
export type ContextPath = z.infer<typeof ContextPathSchema>;

export const ContextRefSchema = z.object({ $ref: ContextPathSchema }).strict();
export type ContextRef = z.infer<typeof ContextRefSchema>;

export const AssertionDefinitionSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("TOOL_CALLED"), tool: z.string().min(1) })
    .strict(),
  z
    .object({
      kind: z.literal("TOOL_ARG_EQUALS"),
      tool: z.string().min(1),
      arg: z.string().min(1),
      expected: z.union([
        JsonPrimitiveSchema,
        z.array(JsonPrimitiveSchema),
        ContextRefSchema,
      ]),
    })
    .strict(),
  z
    .object({ kind: z.literal("OUTPUT_MATCHES_RULE"), rule: z.string().min(1) })
    .strict(),
]);
export type AssertionDefinition = z.infer<typeof AssertionDefinitionSchema>;

export interface AssertionContext {
  session: {
    viewFilters?: JsonValue;
    selectedIds?: string[];
    dateRange?: JsonValue;
    lastQuery?: string;
  };
  user: { rules: string[] };
}

export interface AgentDecision {
  toolCalls: ToolCall[];
  text: string | null;
}

export function isDecidableAtToolBoundary(
  assertion: AssertionDefinition,
): boolean {
  return assertion.kind !== "OUTPUT_MATCHES_RULE";
}

export function evaluateAssertion(
  input: AssertionDefinition,
  decision: AgentDecision,
  context: AssertionContext,
): boolean {
  const assertion = AssertionDefinitionSchema.parse(input);
  if (assertion.kind === "OUTPUT_MATCHES_RULE") return false;
  if (assertion.kind === "TOOL_CALLED") {
    return decision.toolCalls.some(({ name }) => name === assertion.tool);
  }

  const expected = ContextRefSchema.safeParse(assertion.expected).success
    ? resolveContext(assertion.expected as ContextRef, context)
    : assertion.expected;
  return decision.toolCalls
    .filter(({ name }) => name === assertion.tool)
    .some(({ args }) =>
      assertionEqual(readPath(args, assertion.arg), expected),
    );
}

export function assertionEqual(
  left: JsonValue | undefined,
  right: JsonValue | undefined,
): boolean {
  if (left === right) return true;
  if (
    left === undefined ||
    right === undefined ||
    left === null ||
    right === null
  )
    return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    )
      return false;
    if (left.every(isPrimitive) && right.every(isPrimitive)) {
      return [...left]
        .sort(comparePrimitive)
        .every(
          (value, index) => value === [...right].sort(comparePrimitive)[index],
        );
    }
    return left.every((value, index) => assertionEqual(value, right[index]));
  }
  if (typeof left !== "object" || typeof right !== "object") return false;
  const keys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    keys.length === rightKeys.length &&
    keys.every(
      (key, index) =>
        key === rightKeys[index] && assertionEqual(left[key], right[key]),
    )
  );
}

function resolveContext(
  ref: ContextRef,
  context: AssertionContext,
): JsonValue | undefined {
  switch (ref.$ref) {
    case "session.viewFilters":
      return context.session.viewFilters;
    case "session.selectedIds":
      return context.session.selectedIds;
    case "session.dateRange":
      return context.session.dateRange;
    case "session.lastQuery":
      return context.session.lastQuery;
    case "user.rules":
      return context.user.rules;
  }
}

function readPath(
  root: Record<string, JsonValue>,
  path: string,
): JsonValue | undefined {
  let value: JsonValue | undefined = root;
  for (const part of path.split(".").filter(Boolean)) {
    if (value === null || Array.isArray(value) || typeof value !== "object")
      return undefined;
    value = value[part];
  }
  return value;
}

function isPrimitive(value: JsonValue): value is JsonPrimitive {
  return value === null || typeof value !== "object";
}

function comparePrimitive(left: JsonPrimitive, right: JsonPrimitive): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
