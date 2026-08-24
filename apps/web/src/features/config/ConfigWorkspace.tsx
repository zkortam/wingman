'use client'

import type { AgentConfig } from '@wingman/schema'
import Link from 'next/link'
import { useState } from 'react'

import { apiClient } from '../../data/api-client'
import { Confirm } from '../../ui/Confirm'
import { Diff } from '../../ui/Diff'
import { Toast } from '../../ui/Toast'

interface ConfigVersionView {
  id: string
  version: number
  incidentId: string | null
  config?: AgentConfig
}

interface ConfigWorkspaceProps {
  versions: ConfigVersionView[]
  initialOverrideActive: boolean
  agentId: string
  userHash: string
  client?: Pick<typeof apiClient, 'revert'>
}

export const ConfigWorkspace = ({
  versions,
  initialOverrideActive,
  agentId,
  userHash,
  client = apiClient,
}: ConfigWorkspaceProps) => {
  const [left, setLeft] = useState(versions[0]?.id ?? '')
  const [right, setRight] = useState(versions[1]?.id ?? versions[0]?.id ?? '')
  const [overrideActive, setOverrideActive] = useState(initialOverrideActive)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const revert = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await client.revert(agentId, userHash)
      setOverrideActive(false)
      setToast('Override reverted')
    } catch {
      setToast('Revert failed. Nothing changed.')
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <section className="proof">
      <div className="proof-block">
        <div className="proof-label">BASE</div>
        <details>
          <summary>
            <span className="mono">v1</span>, active global configuration
          </summary>
          <pre className="diff">{baseYaml(versions[0]?.config)}</pre>
        </details>
      </div>
      <div className="proof-block">
        <div className="proof-label">VERSIONS</div>
        <table className="data-table config-table">
          <thead>
            <tr>
              <th scope="col">VERSION</th>
              <th scope="col">ORIGIN</th>
              <th scope="col">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id}>
                <td className="mono">v{version.version}</td>
                <td>
                  {version.incidentId ? (
                    <Link href={`/incidents/${version.incidentId}`} className="mono">
                      {version.incidentId}
                    </Link>
                  ) : (
                    'Base configuration'
                  )}
                </td>
                <td>{version.incidentId ? 'User only' : 'Global'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="proof-block">
        <div className="proof-label">COMPARE</div>
        <div className="compare-controls">
          <label>
            From{' '}
            <select
              aria-label="Compare from"
              value={left}
              onChange={(event) => setLeft(event.target.value)}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            To{' '}
            <select
              aria-label="Compare to"
              value={right}
              onChange={(event) => setRight(event.target.value)}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}
                </option>
              ))}
            </select>
          </label>
        </div>
        {left === right ? (
          <p className="muted">Select two different versions to inspect a change.</p>
        ) : (
          <Diff
            path={compare(versions, left, right).path}
            lines={compare(versions, left, right).lines}
          />
        )}
      </div>
      <div className="proof-block">
        <div className="proof-label">OVERRIDES</div>
        <div>
          <strong className="stat-value">{overrideActive ? 1 : 0}</strong>
          <p className="muted">
            Overrides that prove out get promoted to global. A number that only grows means
            promotion is not happening.
          </p>
          {overrideActive ? (
            <div className="override-row">
              <span className="mono">{userHash} | v2</span>
              <span>Last resolved just now</span>
              <button className="danger-button" onClick={() => setConfirming(true)} type="button">
                Revert
              </button>
            </div>
          ) : (
            <p className="muted">No active per-user overrides.</p>
          )}
        </div>
      </div>
      {confirming ? (
        <Confirm
          title="Revert this override?"
          body="This restores the global config for the affected user."
          destructive
          onCancel={() => setConfirming(false)}
          onConfirm={() => void revert()}
          pending={busy}
        />
      ) : null}
      {toast ? <Toast message={toast} /> : null}
    </section>
  )
}

const baseYaml = (config: AgentConfig | undefined): string => {
  if (!config) {
    return 'tools:\n  export_records:\n    description: Exports records from the current object.\nrules: []'
  }
  const tools = Object.entries(config.tools)
    .map(([name, tool]) => `  ${name}:\n    description: ${tool.description}`)
    .join('\n')
  return `tools:\n${tools}\nrules: ${JSON.stringify(config.rules)}`
}

const compare = (
  versions: ConfigVersionView[],
  leftId: string,
  rightId: string,
): { path: string; lines: Array<{ kind: 'context' | 'add' | 'remove'; text: string }> } => {
  const left = versions.find((version) => version.id === leftId)?.config
  const right = versions.find((version) => version.id === rightId)?.config
  const leftTool = left?.tools.export_records?.description ?? left?.systemPrompt ?? 'previous'
  const rightTool = right?.tools.export_records?.description ?? right?.systemPrompt ?? 'next'
  if (leftTool === rightTool) {
    return {
      path: 'rules',
      lines: [
        { kind: 'remove', text: JSON.stringify(left?.rules ?? []) },
        { kind: 'add', text: JSON.stringify(right?.rules ?? []) },
      ],
    }
  }
  return {
    path: 'tools[export_records].description',
    lines: [
      { kind: 'remove', text: leftTool },
      { kind: 'add', text: rightTool },
    ],
  }
}
