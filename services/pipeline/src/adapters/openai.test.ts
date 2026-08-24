import { describe, expect, it, vi } from 'vitest'

import { OpenAIModelClient } from './openai.js'

describe('OpenAIModelClient', () => {
  it('extracts output text without assuming the first output item is a message', async () => {
    const fetcher = vi.fn(async () => Response.json({
      output: [
        { type: 'reasoning' },
        { type: 'message', content: [{ type: 'output_text', text: '{"action":"ALLOW"}' }] },
      ],
    }))
    const client = new OpenAIModelClient('key', fetcher)
    await expect(client.generate({ model: 'model', messages: [] })).resolves.toBe('{"action":"ALLOW"}')
  })

  it('sends strict function tools and decodes function-call arguments', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        input: [{ role: 'system', content: '{"policy":"safe"}' }],
        tools: [{ type: 'function', name: 'classify_outcome', strict: true }],
        tool_choice: 'required',
      })
      return Response.json({
        output: [{
          type: 'function_call',
          name: 'classify_outcome',
          arguments: '{"verdict":"CONFIG_DEFECT","confidence":0.9}',
        }],
      })
    })
    const client = new OpenAIModelClient('key', fetcher)
    await expect(client.generate({
      model: 'model',
      messages: [{ role: 'system', content: { policy: 'safe' } }],
      tools: [{ name: 'classify_outcome', strict: true, parameters: { type: 'object' } }],
    })).resolves.toEqual({ verdict: 'CONFIG_DEFECT', confidence: 0.9 })
  })
})
