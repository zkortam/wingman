import { describe, expect, it } from 'vitest'

import { canonicalJSON } from './canonical.js'
import type { AgentConfig } from './config.js'
import type {
  AgentRunner,
  ConfigStore,
  EmbeddingClient,
  Ledger,
  PipelineCommands,
  PipelineReader,
} from './ports.js'
import type { SessionContext, Turn } from './session.js'

/** An input for which the agent genuinely decides differently across samples.
 *  Without one, the N=5 variance gate cannot be exercised at all. */
export interface VarianceScenario {
  config: AgentConfig
  messages: Turn[]
  context?: SessionContext
}

export function describeAgentRunner(
  name: string,
  setup: () => { runner: AgentRunner; variance: VarianceScenario },
): void {
  const samples = async (
    runner: AgentRunner,
    scenario: VarianceScenario,
  ): Promise<Awaited<ReturnType<AgentRunner['runTurn']>>[]> =>
    Promise.all(
      [0, 1, 2, 3, 4].map((sample) =>
        runner.runTurn({
          config: scenario.config,
          messages: scenario.messages,
          ...(scenario.context === undefined ? {} : { context: scenario.context }),
          intercept: () => 'INTERCEPT',
          sample,
        }),
      ),
    )

  describe(`${name} AgentRunner contract`, () => {
    it('executes nothing when intercept returns INTERCEPT', async () => {
      const { runner, variance } = setup()
      const results = await samples(runner, variance)
      expect(results.reduce((total, { toolExecutions }) => total + toolExecutions, 0)).toBe(0)
    })

    it('returns a stable cassetteKey for identical input', async () => {
      const { runner, variance } = setup()
      const results = await samples(runner, variance)
      expect(new Set(results.map(({ cassetteKey }) => cassetteKey)).size).toBe(1)
    })

    // ARCHITECTURE.md §9: if replay returns the same response five times the gate is theatre.
    it('varies its decision across sample 0..4 for a variance key', async () => {
      const { runner, variance } = setup()
      const results = await samples(runner, variance)
      const decisions = new Set(
        results.map(({ toolCalls, text }) => canonicalJSON({ toolCalls, text })),
      )
      expect(decisions.size).toBeGreaterThan(1)
    })

    it('never throws on a malformed config', async () => {
      const { runner, variance } = setup()
      await expect(
        runner.runTurn({
          config: {} as unknown as AgentConfig,
          messages: variance.messages,
          intercept: () => 'INTERCEPT',
        }),
      ).resolves.toBeDefined()
    })
  })
}

export function describeEmbeddingClient(name: string, create: () => EmbeddingClient): void {
  describe(`${name} EmbeddingClient contract`, () => {
    it('preserves order, dimensions, and deterministic replay', async () => {
      const client = create()
      const input = { texts: ['alpha', 'beta'], dimensions: 1536 as const }
      const first = await client.embed(input)
      const second = await client.embed(input)
      expect(first).toEqual(second)
      expect(first).toHaveLength(2)
      expect(first.every((vector) => vector.length === 1536)).toBe(true)
      expect(first[0]).not.toEqual(first[1])
    })
  })
}

export function describeConfigStore(
  name: string,
  setup: () => Promise<{
    store: ConfigStore
    agentId: string
    userHash: string
  }>,
): void {
  describe(`${name} ConfigStore contract`, () => {
    it('isolates a USER override from a control user', async () => {
      const { store, agentId, userHash } = await setup()
      const control = 'ffffffffffffffffffffffffffffffff'
      const before = canonicalJSON(await store.resolve(agentId, control))
      const base = await store.base(agentId)
      const version = await store.writeVersion(
        agentId,
        { ...base, systemPrompt: 'changed' },
        crypto.randomUUID(),
      )
      await store.setOverride(agentId, userHash, version.id, 'USER')
      expect((await store.resolve(agentId, userHash)).systemPrompt).toBe('changed')
      expect(canonicalJSON(await store.resolve(agentId, control))).toBe(before)
    })
  })
}

export function describeLedger(name: string, create: () => Ledger): void {
  describe(`${name} Ledger contract`, () => {
    it('returns recorded prior art without duplicating idempotent records', async () => {
      const ledger = create()
      const event = {
        incidentId: crypto.randomUUID(),
        fingerprint: 'fingerprint',
        diff: { changes: [{ path: 'systemPrompt', before: 'a', after: 'b' }] },
        outcome: 'VERIFIED',
      }
      await ledger.record(event)
      await ledger.record(event)
      expect(await ledger.priorArt('fingerprint')).toHaveLength(1)
    })
  })
}

export function describePipelineReader(
  name: string,
  setup: () => Promise<{
    reader: PipelineReader
    orgId: string
    incidentId: string
  }>,
): void {
  describe(`${name} PipelineReader contract`, () => {
    it('returns list/detail DTOs and printable metrics', async () => {
      const { reader, orgId, incidentId } = await setup()
      expect((await reader.listIncidents(orgId)).some(({ id }) => id === incidentId)).toBe(true)
      expect((await reader.getIncident(incidentId)).id).toBe(incidentId)
      expect(Number.isFinite((await reader.gatePrecision(orgId)).precision)).toBe(true)
      const rate = await reader.silentFailureRate(orgId)
      expect(Number.isFinite(rate.thisWeek)).toBe(true)
      expect(Number.isFinite(rate.lastWeek)).toBe(true)
    })
  })
}

export function describePipelineCommands(
  name: string,
  setup: () => Promise<{
    commands: PipelineCommands
    incidentId: string
    read: () => Promise<{ state: string; attempt: number }>
  }>,
): void {
  describe(`${name} PipelineCommands contract`, () => {
    it('dismisses idempotently and reopens on a new attempt', async () => {
      const { commands, incidentId, read } = await setup()
      await commands.dismiss(incidentId, 'contract dismissal')
      await commands.dismiss(incidentId, 'contract dismissal')
      expect((await read()).state).toBe('DISCARDED')
      await commands.reopen(incidentId)
      expect(await read()).toMatchObject({ state: 'CLUSTERED', attempt: 2 })
    })
  })
}
