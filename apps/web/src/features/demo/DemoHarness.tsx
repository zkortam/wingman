'use client'

import { useEffect, useState } from 'react'

import { apiClient } from '../../data/api-client'
import { DEMO_AGENT, DEMO_CONTROL_HASH, DEMO_REPORTER_HASH } from '../../domain/demo'

interface PaneState {
  version: 'v1' | 'v2'
  messages: Array<{ role: 'user' | 'assistant'; text: string }>
}

const initialPane = (): PaneState => ({ version: 'v1', messages: [] })

type DemoClient = Pick<typeof apiClient, 'resolveConfig'>

const DemoPane = ({ kind, userHash, client }: { kind: 'REPORTER' | 'CONTROL'; userHash: string; client: DemoClient }) => {
  const [state, setState] = useState<PaneState>(initialPane)
  const [input, setInput] = useState('Export these to CSV')

  useEffect(() => {
    const resolve = async (): Promise<void> => {
      try {
        const result = await client.resolveConfig(DEMO_AGENT, userHash)
        setState((value) => ({ ...value, version: result.version === 2 ? 'v2' : 'v1' }))
      } catch {
        setState((value) => ({ ...value, version: 'v1' }))
      }
    }
    void resolve()
    const interval = window.setInterval(() => void resolve(), 1_000)
    return () => window.clearInterval(interval)
  }, [client, userHash])

  const send = (): void => {
    const message = input.trim()
    if (!message) return
    const response = state.version === 'v2'
      ? 'Exported 10 Negotiation-stage opportunities.'
      : 'Exported all 50 opportunities.'
    setState((value) => ({ ...value, messages: [...value.messages, { role: 'user', text: message }, { role: 'assistant', text: response }] }))
    if (kind === 'REPORTER' && state.version === 'v2') {
      window.dispatchEvent(new Event('outcome-confirmed'))
    }
  }

  return (
    <section className="demo-pane" aria-label={`${kind.toLowerCase()} demo window`}>
      <header className="demo-header">
        <span>{kind}&nbsp;&nbsp;{userHash}</span>
        <span className="demo-version" data-changed={state.version === 'v2'}>config {state.version}</span>
      </header>
      <div className="demo-transcript" aria-live="polite">
        {state.messages.length === 0 ? <span className="muted">Stage = Negotiation, 10 visible opportunities</span> : null}
        {state.messages.map((message, index) => <div className="demo-message" data-role={message.role} key={index}>{message.text}</div>)}
      </div>
      <div className="demo-composer">
        <label className="screen-reader-only" htmlFor={`${kind}-message`}>Message</label>
        <input id={`${kind}-message`} onChange={(event) => setInput(event.target.value)} value={input} />
        <button className="primary-button" disabled={!input.trim()} onClick={send} type="button">Send</button>
      </div>
    </section>
  )
}

export const DemoHarness = ({ client = apiClient }: { client?: DemoClient } = {}) => (
  <main className="demo-shell">
    <div className="demo-grid">
      <DemoPane client={client} kind="REPORTER" userHash={DEMO_REPORTER_HASH} />
      <DemoPane client={client} kind="CONTROL" userHash={DEMO_CONTROL_HASH} />
    </div>
  </main>
)
