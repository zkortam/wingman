import { createHmac } from "node:crypto";

import type { AgentConfig } from "./config.js";

export function canonicalJSON(value: unknown): string {
  return encode(value, false);
}

export function signConfig(
  key: string | Uint8Array,
  agentId: string,
  version: number,
  config: AgentConfig,
): string {
  const payload = `${agentId}.${version}.${canonicalJSON(config)}`;
  return createHmac("sha256", key).update(payload).digest("hex");
}

function encode(value: unknown, inArray: boolean): string {
  if (value === undefined) return inArray ? "null" : "";
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError("Unsupported number");
    return encoded;
  }
  if (Array.isArray(value))
    return `[${value.map((item) => encode(item, true)).join(",")}]`;
  if (typeof value !== "object")
    throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("Canonical JSON only accepts plain objects");
  }
  const object = value as Record<string, unknown>;
  const members = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${encode(object[key], false)}`);
  return `{${members.join(",")}}`;
}
