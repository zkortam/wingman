import { createServer } from 'node:http'

import { PAGE } from './page.js'
import { DemoSession } from './session.js'

const PORT = Number(process.env.PORT ?? 4317)
const session = new DemoSession()

const server = createServer((request, response) => {
  const url = request.url ?? '/'

  const json = (body: unknown): void => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  }

  if (request.method === 'GET' && (url === '/' || url.startsWith('/?'))) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(PAGE)
    return
  }

  if (request.method === 'POST' && url === '/api/reset') {
    session.reset()
    json(session.state())
    return
  }

  if (request.method === 'GET' && url === '/api/state') {
    json(session.state())
    return
  }

  if (request.method === 'POST' && url === '/api/chat') {
    let raw = ''
    request.on('data', (chunk: Buffer) => {
      raw += chunk.toString()
    })
    request.on('end', () => {
      void (async () => {
        try {
          const { text } = JSON.parse(raw || '{}') as { text?: unknown }
          if (typeof text === 'string' && text.trim().length > 0) {
            await session.send(text.trim())
          }
        } catch {
          // A malformed turn must not take the demo down mid-conversation.
        }
        json(session.state())
      })()
    })
    return
  }

  response.writeHead(404).end()
})

server.listen(PORT, () => {
  process.stdout.write(`Amazoff demo on http://localhost:${String(PORT)}\n`)
})
