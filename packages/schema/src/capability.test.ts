import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  capabilityDemand,
  capabilityKey,
  CapabilityRequestSchema,
  type CapabilityRequest,
} from './capability.js'

const AGENT_ID = '11111111-1111-4111-8111-111111111111'

const request = (userHashes: string[]): CapabilityRequest => ({
  id: randomUUID(),
  orgId: randomUUID(),
  agentId: AGENT_ID,
  key: 'a'.repeat(64),
  title: 'International shipping',
  impliedTool: 'create_shipment',
  userHashes,
  sessionIds: [],
  evidenceExcerpts: [],
  state: 'OPEN',
  firstSeen: '2026-08-23T00:00:00.000Z',
  lastSeen: '2026-08-23T00:00:00.000Z',
})

describe('CapabilityRequestSchema', () => {
  it('requires hashed requesters so a demand count is never a customer list', () => {
    expect(() => CapabilityRequestSchema.parse(request(['ledgerline-user-01']))).toThrow()
  })

  it('accepts a request with no nameable tool', () => {
    expect(() => CapabilityRequestSchema.parse({ ...request([]), impliedTool: null })).not.toThrow()
  })
})

describe('capabilityDemand', () => {
  it('counts distinct users', () => {
    expect(capabilityDemand(request(['a'.repeat(32), 'b'.repeat(32)]))).toBe(2)
  })

  // One frustrated user asking six times is one unit of demand.
  it('counts a repeatedly asking user once', () => {
    expect(capabilityDemand(request(['a'.repeat(32), 'a'.repeat(32), 'a'.repeat(32)]))).toBe(1)
  })

  it('is zero before anyone has asked', () => {
    expect(capabilityDemand(request([]))).toBe(0)
  })
})

describe('capabilityKey', () => {
  it('is 64 hex characters', () => {
    expect(
      capabilityKey({
        agentId: AGENT_ID,
        impliedTool: 'create_shipment',
        phrase: 'ship to Malaysia',
      }),
    ).toMatch(/^[a-f0-9]{64}$/)
  })

  // The point of the lane is the count, so differently worded requests for the same gap must collide.
  it('buckets different phrasings of the same gap together', () => {
    const key = (phrase: string): string =>
      capabilityKey({ agentId: AGENT_ID, impliedTool: 'create_shipment', phrase })
    expect(key('ship to Malaysia')).toBe(key('can you post this to KL'))
  })

  it('separates different gaps on the same agent', () => {
    expect(
      capabilityKey({
        agentId: AGENT_ID,
        impliedTool: 'create_shipment',
        phrase: 'ship to Malaysia',
      }),
    ).not.toBe(
      capabilityKey({
        agentId: AGENT_ID,
        impliedTool: 'issue_store_credit',
        phrase: 'can I get store credit',
      }),
    )
  })

  it('separates the same gap across agents', () => {
    expect(
      capabilityKey({
        agentId: AGENT_ID,
        impliedTool: 'create_shipment',
        phrase: 'ship to Malaysia',
      }),
    ).not.toBe(
      capabilityKey({
        agentId: '22222222-2222-4222-8222-222222222222',
        impliedTool: 'create_shipment',
        phrase: 'ship to Malaysia',
      }),
    )
  })

  it('falls back to the normalized phrase when no tool can be named', () => {
    const key = (phrase: string): string =>
      capabilityKey({ agentId: AGENT_ID, impliedTool: null, phrase })
    expect(key('Ship  To   MALAYSIA ')).toBe(key('ship to malaysia'))
    expect(key('ship to malaysia')).not.toBe(key('store credit please'))
  })
})
