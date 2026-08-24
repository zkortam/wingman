import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { CassetteStore } from './cassette'
import { CassetteModelClient } from './model-client'

describe('CassetteModelClient', () => {
  it('records once and replays without calling the model boundary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'outcome-model-'))
    const request = { model: 'demo', messages: ['hello'], sample: 0 }
    const realModel = vi.fn(async () => ({ text: 'recorded' }))
    const recorder = new CassetteModelClient({ store: new CassetteStore({ directory, mode: 'record' }), record: realModel })
    expect(await recorder.generate(request)).toEqual({ text: 'recorded' })

    const forbiddenNetwork = vi.fn(async () => { throw new Error('network called during replay') })
    const replay = new CassetteModelClient({ store: new CassetteStore({ directory, mode: 'replay' }), record: forbiddenNetwork })
    expect(await replay.generate(request)).toEqual({ text: 'recorded' })
    expect(forbiddenNetwork).not.toHaveBeenCalled()
  })
})
