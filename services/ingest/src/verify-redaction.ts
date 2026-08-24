import {
  SessionInputSchema,
  type JsonValue,
  type SessionInput,
} from "@wingman/schema";

const RAW_IDENTITY_KEYS = new Set([
  "email",
  "phone",
  "ssn",
  "password",
  "secret",
  "token",
  "userid",
  "user_id",
]);

export class RedactionVerificationError extends Error {
  constructor(readonly path: string) {
    super(`Payload contains a field that should have been redacted: ${path}`);
    this.name = "RedactionVerificationError";
  }
}

export function verifyRedaction(input: unknown): SessionInput {
  const session = SessionInputSchema.parse(input);
  for (const turn of session.turns) {
    for (const call of turn.toolCalls)
      inspectObject(call.args, `turns.${turn.idx}.toolCalls.${call.id}.args`);
  }
  inspectValue(session.viewFilters, "viewFilters");
  inspectValue(session.dateRange, "dateRange");
  return session;
}

function inspectValue(value: JsonValue | undefined, path: string): void {
  if (value === undefined || value === null || typeof value !== "object")
    return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectValue(entry, `${path}.${index}`));
    return;
  }
  inspectObject(value, path);
}

function inspectObject(value: Record<string, JsonValue>, path: string): void {
  for (const [key, entry] of Object.entries(value)) {
    if (RAW_IDENTITY_KEYS.has(key.toLowerCase()))
      throw new RedactionVerificationError(`${path}.${key}`);
    inspectValue(entry, `${path}.${key}`);
  }
}
