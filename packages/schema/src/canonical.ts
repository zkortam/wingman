import { createHmac } from 'node:crypto'

import type { AgentConfig } from './config.js'
import { JSON_LIMITS } from './json.js'

/** Deterministic JSON used for signatures and idempotency comparisons. */
export function canonicalJSON(value: unknown): string {
  return encode(value, false, 0, new Set())
}

export function signConfig(
  key: string | Uint8Array,
  agentId: string,
  version: number,
  config: AgentConfig,
): string {
  const payload = `${agentId}.${version}.${canonicalJSON(config)}`
  return createHmac('sha256', key).update(payload).digest('hex')
}

function encode(value: unknown, inArray: boolean, depth: number, ancestors: Set<object>): string {
  if (depth > JSON_LIMITS.maxDepth) {
    throw new TypeError(`Canonical JSON nests deeper than ${String(JSON_LIMITS.maxDepth)} levels`)
  }
  if (value === undefined) return inArray ? 'null' : ''
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    // JSON.stringify renders NaN and Infinity as "null", which would make two materially different.
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON only accepts finite numbers')
    }
    // -0 and 0 are the same value but render differently across engines.
    return JSON.stringify(value === 0 ? 0 : value)
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`)
  }
  if (ancestors.has(value)) {
    throw new TypeError('Canonical JSON does not accept cyclic values')
  }
  const nested = new Set(ancestors).add(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => encode(item, true, depth + 1, nested)).join(',')}]`
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Canonical JSON only accepts plain objects')
  }
  const object = value as Record<string, unknown>
  const members = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${encode(object[key], false, depth + 1, nested)}`)
  return `{${members.join(',')}}`
}
