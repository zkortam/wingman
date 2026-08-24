import { describe, expect, it } from 'vitest'

import { applyDiff, diffConfigs, type AgentConfig } from './config.js'

const base = (tools: AgentConfig['tools'] = {}): AgentConfig => ({
  systemPrompt: 'You are a careful operations assistant.',
  tools,
  retrieval: {},
  rules: [],
})

/** `diffConfigs` and `applyDiff` are shipped as a matched pair: the repair lane produces a diff. */
const roundTrips = (before: AgentConfig, after: AgentConfig): void => {
  const diff = diffConfigs(before, after)
  expect(diff).not.toBeNull()
  if (diff === null) return
  expect(applyDiff(before, diff)).toEqual(after)
}

describe('a diff can be applied for every change it can describe', () => {
  it('changes the system prompt', () => {
    roundTrips(base(), { ...base(), systemPrompt: 'Changed.' })
  })

  it('changes rules', () => {
    roundTrips(base(), { ...base(), rules: ['Always confirm before exporting.'] })
  })

  it('changes retrieval settings', () => {
    roundTrips(base(), { ...base(), retrieval: { topK: 5 } })
  })

  it('changes a tool description', () => {
    roundTrips(
      base({ export_records: { description: 'Export.' } }),
      base({
        export_records: { description: "Export using the caller's active filters." },
      }),
    )
  })

  it('adds a tool', () => {
    roundTrips(base(), base({ export_records: { description: 'Export.' } }))
  })

  it('adds a second tool alongside an existing one', () => {
    roundTrips(
      base({ a: { description: 'A.' } }),
      base({
        a: { description: 'A.' },
        b: { description: 'B.' },
      }),
    )
  })

  it('removes a tool', () => {
    roundTrips(base({ export_records: { description: 'Export.' } }), base())
  })

  it('removes one tool and keeps another', () => {
    roundTrips(
      base({ a: { description: 'A.' }, b: { description: 'B.' } }),
      base({
        a: { description: 'A.' },
      }),
    )
  })

  it('adds tool parameters', () => {
    roundTrips(
      base({ a: { description: 'A.' } }),
      base({
        a: { description: 'A.', parameters: { stage: 'string' } },
      }),
    )
  })

  it('clears tool parameters', () => {
    roundTrips(
      base({ a: { description: 'A.', parameters: { stage: 'string' } } }),
      base({ a: { description: 'A.' } }),
    )
  })

  it('changes tool parameters', () => {
    roundTrips(
      base({ a: { description: 'A.', parameters: { stage: 'string' } } }),
      base({ a: { description: 'A.', parameters: { stage: 'number' } } }),
    )
  })

  it('adds a tool with parameters in one diff', () => {
    roundTrips(base(), base({ a: { description: 'A.', parameters: { stage: 'string' } } }))
  })

  it('replaces one tool with another', () => {
    roundTrips(base({ a: { description: 'A.' } }), base({ b: { description: 'B.' } }))
  })

  it('changes several fields at once', () => {
    roundTrips(base({ a: { description: 'A.' } }), {
      systemPrompt: 'Changed.',
      tools: { b: { description: 'B.' } },
      retrieval: { topK: 3 },
      rules: ['Confirm first.'],
    })
  })
})

describe('applyDiff still refuses to apply against the wrong base', () => {
  it('rejects a diff whose before value no longer matches', () => {
    const diff = diffConfigs(base(), { ...base(), systemPrompt: 'Changed.' })
    expect(diff).not.toBeNull()
    if (diff === null) return
    expect(() => applyDiff({ ...base(), systemPrompt: 'Something else.' }, diff)).toThrow(
      /changed before diff application/,
    )
  })

  it('rejects adding a tool that already exists with a different description', () => {
    const diff = diffConfigs(base(), base({ a: { description: 'A.' } }))
    expect(diff).not.toBeNull()
    if (diff === null) return
    expect(() => applyDiff(base({ a: { description: 'Different.' } }), diff)).toThrow(
      /changed before diff application/,
    )
  })

  it('reports no diff between identical configurations', () => {
    expect(
      diffConfigs(base({ a: { description: 'A.' } }), base({ a: { description: 'A.' } })),
    ).toBeNull()
  })

  it('refuses a path that would reach the prototype chain', () => {
    expect(() =>
      applyDiff(base(), {
        changes: [{ path: 'tools.__proto__.description', before: null, after: 'x' }],
      }),
    ).toThrow()
  })
})
