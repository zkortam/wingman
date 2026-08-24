import { z } from "zod";

import { JsonObjectSchema, JsonValueSchema, type JsonValue } from "./json.js";

const ToolConfigSchema = z
  .object({
    description: z.string().min(1),
    parameters: JsonObjectSchema.optional(),
  })
  .strict();

export const RuleSchema = z.string();
export type Rule = z.infer<typeof RuleSchema>;

export const AgentConfigSchema = z
  .object({
    systemPrompt: z.string(),
    tools: z.record(ToolConfigSchema),
    retrieval: JsonObjectSchema,
    rules: z.array(RuleSchema),
  })
  .strict();

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const ConfigChangeSchema = z
  .object({
    path: z.string().min(1),
    before: JsonValueSchema,
    after: JsonValueSchema,
  })
  .strict();

export const ConfigDiffSchema = z
  .object({ changes: z.array(ConfigChangeSchema).min(1) })
  .strict()
  .superRefine(({ changes }, context) => {
    const paths = changes.map(({ path }) => path);
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      if (path === undefined) continue;
      if (parsePath(path).length === 0) {
        context.addIssue({
          code: "custom",
          message: `Invalid config path: ${path}`,
        });
      }
      for (const other of paths.slice(index + 1)) {
        if (pathsOverlap(path, other)) {
          context.addIssue({
            code: "custom",
            message: `Overlapping config paths: ${path}, ${other}`,
          });
        }
      }
    }
  });

export type ConfigDiff = z.infer<typeof ConfigDiffSchema>;

const PROHIBITED_PATH_PARTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export function applyDiff(base: AgentConfig, input: ConfigDiff): AgentConfig {
  const diff = ConfigDiffSchema.parse(input);
  const next = structuredClone(
    AgentConfigSchema.parse(base),
  ) as unknown as Record<string, JsonValue>;

  for (const change of diff.changes) {
    const parts = parsePath(change.path);
    const current = readPath(next, parts);
    if (!jsonEqual(current, change.before)) {
      throw new Error(
        `Config changed before diff application at ${change.path}`,
      );
    }
    writePath(next, parts, structuredClone(change.after));
  }

  return AgentConfigSchema.parse(next);
}

export function configDiffBytes(diff: ConfigDiff): number {
  return new TextEncoder().encode(JSON.stringify(ConfigDiffSchema.parse(diff)))
    .byteLength;
}

/** Lowest-path diff used by writeVersion to enforce the writable allowlist. */
export function diffConfigs(
  before: AgentConfig,
  after: AgentConfig,
): ConfigDiff | null {
  const changes: Array<z.infer<typeof ConfigChangeSchema>> = [];
  if (before.systemPrompt !== after.systemPrompt) {
    changes.push({
      path: "systemPrompt",
      before: before.systemPrompt,
      after: after.systemPrompt,
    });
  }
  if (!jsonEqual(before.rules, after.rules)) {
    changes.push({ path: "rules", before: before.rules, after: after.rules });
  }
  if (!jsonEqual(before.retrieval, after.retrieval)) {
    changes.push({
      path: "retrieval",
      before: before.retrieval,
      after: after.retrieval,
    });
  }
  for (const name of new Set([
    ...Object.keys(before.tools),
    ...Object.keys(after.tools),
  ])) {
    const left = before.tools[name];
    const right = after.tools[name];
    if ((left?.description ?? null) !== (right?.description ?? null)) {
      changes.push({
        path: `tools.${name}.description`,
        before: left?.description ?? null,
        after: right?.description ?? null,
      });
    }
    if (!jsonEqual(left?.parameters ?? null, right?.parameters ?? null)) {
      changes.push({
        path: `tools.${name}.parameters`,
        before: left?.parameters ?? null,
        after: right?.parameters ?? null,
      });
    }
  }
  return changes.length === 0 ? null : ConfigDiffSchema.parse({ changes });
}

/** Matches customer writable-path declarations without granting sibling fields. */
export function isConfigPathWritable(path: string, allowed: string): boolean {
  const pathParts = parsePath(path);
  const allowedParts = allowed.split(".");
  if (
    pathParts.length === 0 ||
    allowedParts.length === 0 ||
    allowedParts.some((part) => part.length === 0)
  )
    return false;
  const trailingWildcard = allowedParts.at(-1) === "*";
  if (
    trailingWildcard
      ? pathParts.length < allowedParts.length
      : pathParts.length !== allowedParts.length
  )
    return false;
  return allowedParts.every(
    (part, index) =>
      part === "*" || part === pathParts[index],
  );
}

function parsePath(path: string): string[] {
  const parts = path.split(".");
  if (
    parts.length === 0 ||
    parts.some((part) => part.length === 0 || PROHIBITED_PATH_PARTS.has(part))
  )
    return [];
  return parts;
}

function pathsOverlap(left: string, right: string): boolean {
  return (
    left === right ||
    left.startsWith(`${right}.`) ||
    right.startsWith(`${left}.`)
  );
}

function readPath(
  root: Record<string, JsonValue>,
  parts: string[],
): JsonValue | undefined {
  let value: JsonValue | undefined = root;
  for (const part of parts) {
    if (value === null || Array.isArray(value) || typeof value !== "object")
      return undefined;
    value = value[part];
  }
  return value;
}

function writePath(
  root: Record<string, JsonValue>,
  parts: string[],
  value: JsonValue,
): void {
  const leaf = parts.at(-1);
  if (leaf === undefined) throw new Error("Config diff path is empty");
  let parent: Record<string, JsonValue> = root;
  for (const part of parts.slice(0, -1)) {
    const child = parent[part];
    if (child === null || Array.isArray(child) || typeof child !== "object") {
      throw new Error(`Config diff parent does not exist: ${part}`);
    }
    parent = child;
  }
  parent[leaf] = value;
}

function jsonEqual(left: JsonValue | undefined, right: JsonValue): boolean {
  if (left === right) return true;
  if (left === undefined || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index] as JsonValue))
    );
  }
  if (typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonEqual(left[key], right[key] as JsonValue),
    )
  );
}
