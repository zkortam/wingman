import {
  SessionInputSchema,
  type SessionInput,
  type Turn,
} from "@wingman/schema";

import { hashUserId } from "./hash.js";
import type { PiiScrubber } from "./openredaction.js";

export type CapturedTurn = Omit<Turn, "textRedacted"> & {
  text: string | null;
};

export type SessionObservationInput = Omit<
  SessionInput,
  "orgId" | "agentId" | "userHash" | "redaction" | "turns"
> & {
  userId: string;
  agent?: string;
  turns: CapturedTurn[];
};

interface PrepareSessionOptions {
  orgId: string;
  orgSalt: string;
  defaultAgent: string;
  fields: string[];
  scrubber: PiiScrubber;
}

const OPTIONAL_FIELDS = new Set([
  "personaId",
  "viewFilters",
  "selectedIds",
  "dateRange",
  "lastQuery",
  "userRules",
]);

export async function prepareSession(
  input: SessionObservationInput,
  options: PrepareSessionOptions,
): Promise<SessionInput | null> {
  try {
    const included = options.fields.filter((field) => OPTIONAL_FIELDS.has(field));
    const candidate: Record<string, unknown> = {
      id: input.id,
      orgId: options.orgId,
      agentId: input.agent ?? options.defaultAgent,
      userHash: hashUserId(options.orgSalt, input.userId),
      startedAt: input.startedAt,
      ...(input.endedAt === undefined ? {} : { endedAt: input.endedAt }),
      ...(input.configVersionId === undefined
        ? {}
        : { configVersionId: input.configVersionId }),
      ...(input.generationCancelled === undefined
        ? {}
        : { generationCancelled: input.generationCancelled }),
      ...(input.telemetry === undefined
        ? {}
        : { telemetry: structuredClone(input.telemetry) }),
      turns: await Promise.all(
        input.turns.map(async (turn) => ({
          idx: turn.idx,
          role: turn.role,
          textRedacted:
            turn.text === null
              ? null
              : await options.scrubber.scrub(turn.text),
          toolCalls: await Promise.all(
            turn.toolCalls.map(async (call) => ({
              ...call,
              args: await scrubValue(call.args, options.scrubber),
            })),
          ),
          createdAt: turn.createdAt,
        })),
      ),
      redaction: {
        mode: "allowlist",
        fields: ["turns", ...included],
        piiScrubbed: true,
        userIdHashed: true,
      },
    };
    for (const field of included) {
      const value = input[field as keyof SessionObservationInput];
      if (value !== undefined)
        candidate[field] = await scrubValue(value, options.scrubber);
    }
    const parsed = SessionInputSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function scrubValue(
  value: unknown,
  scrubber: PiiScrubber,
): Promise<unknown> {
  if (typeof value === "string") return scrubber.scrub(value);
  if (Array.isArray(value))
    return Promise.all(value.map((entry) => scrubValue(entry, scrubber)));
  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(
        async ([key, entry]) =>
          [key, await scrubValue(entry, scrubber)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }
  return value;
}
