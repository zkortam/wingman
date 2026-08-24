import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { CassetteStore, cassetteKey } from './cassette'
import { requiredCassetteRequests } from './cassette-manifest'

describe('CassetteStore', () => {
  it('replays five recorded responses without touching the network', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'outcome-cassettes-'))
    const request = { messages: [{ role: 'user', content: 'export these' }], model: 'demo' }
    const key = cassetteKey(request)
    const record = vi.fn(async () => ({ impossible: true }))
    const writer = new CassetteStore({ directory, mode: 'record' })

    for (let sample = 0; sample < 5; sample += 1) {
      await writer.response(request, sample, async () => ({ sample }))
    }

    const reader = new CassetteStore({ directory, mode: 'replay' })
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, sample) => reader.response(request, sample, record)),
    )

    expect(responses).toEqual([
      { sample: 0 },
      { sample: 1 },
      { sample: 2 },
      { sample: 3 },
      { sample: 4 },
    ])
    expect(record).not.toHaveBeenCalled()
    expect(JSON.parse(await readFile(join(directory, `${key}.json`), 'utf8'))).toMatchObject({
      key,
    })
  })

  it('fails preflight before a demo starts when a key is absent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'outcome-cassettes-'))
    const store = new CassetteStore({ directory, mode: 'replay' })

    await expect(store.preflight([{ model: 'demo', messages: [] }])).rejects.toThrow(
      'Missing cassette',
    )
  })

  it('produces a stable key independent of object key order', () => {
    expect(cassetteKey({ model: 'demo', messages: [] })).toBe(
      cassetteKey({ messages: [], model: 'demo' }),
    )
  })

  it('preflights every committed demo cassette', async () => {
    const directory = join(import.meta.dirname, '../cassettes')
    const store = new CassetteStore({ directory, mode: 'replay' })
    await expect(store.preflight(requiredCassetteRequests)).resolves.toBeUndefined()
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, sample) =>
        store.response(requiredCassetteRequests[0], sample, async () => null),
      ),
    )
    expect(new Set(responses.map((response) => JSON.stringify(response))).size).toBe(5)
  })
})
