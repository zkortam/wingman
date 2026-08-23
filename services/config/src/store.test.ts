import type { AgentConfig } from '@outcome/schema'
import { describe, expect, it } from 'vitest'

import { InMemoryConfigRepository } from './repository'
import { OutcomeConfigStore } from './store'

const base = { systemPrompt: 'base', tools: [], rules: [] } as unknown as AgentConfig
const changed = { systemPrompt: 'base', tools: [], rules: ['reporter'] } as unknown as AgentConfig
const canonicalize = (value: unknown): string => JSON.stringify(value)

const make = () => {
  const repository = new InMemoryConfigRepository({
    agents: [{ id: 'agent', baseConfig: base, activeVersionId: null, writablePaths: ['rules'], maxDiffBytes: 4096, signingKey: 'secret' }],
  })
  return { repository, store: new OutcomeConfigStore({ repository, fallbackConfigs: new Map([['agent', base]]), canonicalize }) }
}

describe('OutcomeConfigStore', () => {
  it('keeps a control user byte-identical after a reporter override', async () => {
    const { store } = make()
    const before = await store.resolve('agent', 'control')
    const version = await store.writeVersion('agent', changed, 'incident')
    await store.setOverride('agent', 'reporter', version.id, 'USER')

    expect(canonicalize(await store.resolve('agent', 'control'))).toBe(canonicalize(before))
    expect(await store.resolve('agent', 'reporter')).toEqual(changed)
  })

  it('fails open to the customer base config when persistence is unavailable', async () => {
    const { repository, store } = make()
    repository.setUnavailable(true)
    await expect(store.resolve('agent', 'reporter')).resolves.toEqual(base)
  })

  it('creates immutable versions and reverts by revoking a pointer', async () => {
    const { repository, store } = make()
    const version = await store.writeVersion('agent', changed, 'incident')
    await store.setOverride('agent', 'reporter', version.id, 'USER')
    await store.revertOverride('agent', 'reporter')

    expect(await store.resolve('agent', 'reporter')).toEqual(base)
    expect(repository.versionCount()).toBe(1)
    expect(repository.revokedOverrideCount()).toBe(1)
  })

  it('returns the same immutable version when an incident write is retried', async () => {
    const { repository, store } = make()
    const first = await store.writeVersion('agent', changed, 'incident')
    const retried = await store.writeVersion('agent', changed, 'incident')
    expect(retried.id).toBe(first.id)
    expect(repository.versionCount()).toBe(1)
  })

  it('does not expose a mutable cache reference', async () => {
    const { store } = make()
    const first = await store.resolve('agent', 'reporter') as unknown as { systemPrompt: string }
    first.systemPrompt = 'tampered'
    const second = await store.resolve('agent', 'reporter') as unknown as { systemPrompt: string }
    expect(second.systemPrompt).toBe('base')
  })

  it('rejects changes outside the writable field contract', async () => {
    const { store } = make()
    await expect(store.assertWritable('agent', { operations: [{ path: 'systemPrompt', value: 'unsafe' }] } as never)).rejects.toThrow('PATH_NOT_WRITABLE')
  })
})
