import type { ModelClient } from '@wingman/schema'

export class OpenAIModelClient implements ModelClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {
    if (!apiKey.trim()) throw new Error('OpenAI API key is required')
  }

  async generate(request: Parameters<ModelClient['generate']>[0]): Promise<unknown> {
    const tools = request.tools?.map((tool) => ({ ...(tool as object), type: 'function' }))
    const response = await this.fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        input: request.messages.map(normalizeMessage),
        store: false,
        ...(tools === undefined ? {} : { tools, tool_choice: 'required' }),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) throw new Error(`Model transport returned ${String(response.status)}`)
    const payload = await response.json()
    if (!payload || typeof payload !== 'object') throw new Error('Model response is invalid')
    const output = (payload as { output?: unknown }).output
    if (!Array.isArray(output)) throw new Error('Model response is invalid')
    const allowedTools = new Set(
      tools?.flatMap((tool) => {
        const name = (tool as { name?: unknown }).name
        return typeof name === 'string' ? [name] : []
      }),
    )
    for (const item of output) {
      if (!item || typeof item !== 'object') continue
      const call = item as { type?: unknown; name?: unknown; arguments?: unknown }
      if (
        call.type !== 'function_call' ||
        typeof call.name !== 'string' ||
        !allowedTools.has(call.name)
      )
        continue
      if (typeof call.arguments !== 'string') throw new Error('Model function call is invalid')
      return JSON.parse(call.arguments) as unknown
    }
    for (const item of output) {
      if (
        !item ||
        typeof item !== 'object' ||
        !Array.isArray((item as { content?: unknown }).content)
      )
        continue
      for (const content of (item as { content: unknown[] }).content) {
        if (
          content &&
          typeof content === 'object' &&
          (content as { type?: unknown }).type === 'output_text' &&
          typeof (content as { text?: unknown }).text === 'string'
        ) {
          return (content as { text: string }).text
        }
      }
    }
    throw new Error('Model response contained no output text')
  }
}

const normalizeMessage = (message: unknown): unknown => {
  if (!message || typeof message !== 'object') return message
  const value = message as { role?: unknown; content?: unknown }
  if (typeof value.role !== 'string' || value.content === undefined) return message
  return {
    role: value.role,
    content: typeof value.content === 'string' ? value.content : JSON.stringify(value.content),
  }
}
