import { ConfigVersionSchema, type AgentConfig } from '@wingman/schema'
import { describe, expect, it } from 'vitest'

import { InMemoryConfigRepository } from './repository'
import { WingmanConfigStore } from './store'

const AGENT_ID = '10000000-0000-4000-8000-000000000001'
const INCIDENT_ID = '20000000-0000-4000-8000-000000000001'
const base: AgentConfig = { systemPrompt: 'base', tools: {}, retrieval: {}, rules: [] }
const changed: AgentConfig = { ...base, rules: ['reporter'] }
const canonicalize = (value: unknown): string => JSON.stringify(value)

const make = () => {
  const repository = new InMemoryConfigRepository({
    agents: [
      {
        id: AGENT_ID,
        baseConfig: base,
        baseVersion: 1,
        activeVersionId: null,
        writablePaths: ['rules'],
        maxDiffBytes: 4096,
        signingKey: 'secret',
      },
    ],
  })
  return {
    repository,
    store: new WingmanConfigStore({
      repository,
      fallbackConfigs: new Map([[AGENT_ID, base]]),
      canonicalize,
    }),
  }
}

describe('WingmanConfigStore', () => {
  it('keeps a control user byte-identical after a reporter override', async () => {
    const { store } = make()
    const before = await store.resolve(AGENT_ID, 'control')
    const version = await store.writeVersion(AGENT_ID, changed, INCIDENT_ID)
    await store.setOverride(AGENT_ID, 'reporter', version.id, 'USER')

    expect(canonicalize(await store.resolve(AGENT_ID, 'control'))).toBe(canonicalize(before))
    expect(await store.resolve(AGENT_ID, 'reporter')).toEqual(changed)
  })

  it('fails open to the customer base config when persistence is unavailable', async () => {
    const { repository, store } = make()
    repository.setUnavailable(true)
    await expect(store.resolve(AGENT_ID, 'reporter')).resolves.toEqual(base)
  })

  it('delivers signed base and override envelopes for SDK resolution', async () => {
    const { store } = make()
    const baseEnvelope = await store.resolveSigned(AGENT_ID, 'reporter')
    expect(baseEnvelope).toMatchObject({ config: base, version: 1 })
    expect(baseEnvelope.signature).toMatch(/^[a-f0-9]{64}$/)

    const version = await store.writeVersion(AGENT_ID, changed, INCIDENT_ID)
    await store.setOverride(AGENT_ID, 'reporter', version.id, 'USER')
    await expect(store.resolveSigned(AGENT_ID, 'reporter')).resolves.toEqual({
      config: changed,
      version: version.version,
      signature: version.signature,
    })
  })

  it('refuses to write a version that mutates a non-writable path', async () => {
    const { store } = make()
    await expect(
      store.writeVersion(AGENT_ID, { ...base, systemPrompt: 'nope' }, INCIDENT_ID),
    ).rejects.toThrow('PATH_NOT_WRITABLE')
  })

  it('creates immutable versions and reverts by revoking a pointer', async () => {
    const { repository, store } = make()
    const version = await store.writeVersion(AGENT_ID, changed, INCIDENT_ID)
    await store.setOverride(AGENT_ID, 'reporter', version.id, 'USER')
    await store.revertOverride(AGENT_ID, 'reporter')

    expect(await store.resolve(AGENT_ID, 'reporter')).toEqual(base)
    expect(repository.versionCount()).toBe(1)
    expect(repository.revokedOverrideCount()).toBe(1)
  })

  it('reverts a global version back to the base config', async () => {
    const { store } = make()
    const version = await store.writeVersion(AGENT_ID, changed, INCIDENT_ID)
    await store.setOverride(AGENT_ID, '', version.id, 'GLOBAL')
    expect(await store.resolve(AGENT_ID, 'any-user')).toEqual(changed)

    await store.revertOverride(AGENT_ID, '')

    expect(await store.resolve(AGENT_ID, 'any-user')).toEqual(base)
  })

  it('returns the same immutable version when an incident write is retried', async () => {
    const { repository, store } = make()
    const first = await store.writeVersion(AGENT_ID, changed, INCIDENT_ID)
    const retried = await store.writeVersion(AGENT_ID, changed, INCIDENT_ID)
    expect(retried.id).toBe(first.id)
    expect(repository.versionCount()).toBe(1)
    expect(ConfigVersionSchema.safeParse(first).success).toBe(true)
    expect(first.createdBy).toBe('PIPELINE')
  })

  it('does not expose a mutable cache reference', async () => {
    const { store } = make()
    const first = (await store.resolve(AGENT_ID, 'reporter')) as unknown as { systemPrompt: string }
    first.systemPrompt = 'tampered'
    const second = (await store.resolve(AGENT_ID, 'reporter')) as unknown as {
      systemPrompt: string
    }
    expect(second.systemPrompt).toBe('base')
  })

  it('rejects changes outside the writable field contract', async () => {
    const { store } = make()
    await expect(
      store.assertWritable(AGENT_ID, {
        changes: [{ path: 'systemPrompt', before: 'base', after: 'unsafe' }],
      }),
    ).rejects.toThrow('PATH_NOT_WRITABLE')
  })
})
