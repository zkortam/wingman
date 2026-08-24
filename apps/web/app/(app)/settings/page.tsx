import { PageHeader } from '../../../src/ui/PageHeader'

export const dynamic = 'force-dynamic'

interface IntegrationStatus {
  label: string
  configured: boolean
  detail: string
}

export default function SettingsPage() {
  const statuses = integrationStatuses()
  return (
    <>
      <PageHeader title="Settings" meta="Production integration readiness" />
      <section aria-label="Integration readiness" className="proof">
        {statuses.map((status) => (
          <div className="proof-block" key={status.label}>
            <div className="proof-label">{status.label}</div>
            <div>
              <span className="state-badge" data-state={status.configured ? 'CONFIRMED' : 'PARKED'}>
                {status.configured ? 'Configured' : 'Not configured'}
              </span>
              <p className="muted">{status.detail}</p>
            </div>
          </div>
        ))}
      </section>
    </>
  )
}

const integrationStatuses = (): IntegrationStatus[] => [
  {
    label: 'SDK authentication',
    configured: present('WINGMAN_API_KEY'),
    detail: 'Authenticates event, config, and tool-review requests from agent hosts.',
  },
  {
    label: 'Operator authentication',
    configured: present('WINGMAN_OPERATOR_USERNAME') && present('WINGMAN_OPERATOR_PASSWORD'),
    detail: 'Protects the operator interface and control-plane routes.',
  },
  {
    label: 'Database',
    configured: present('SUPABASE_URL') && present('SUPABASE_SERVICE_ROLE_KEY'),
    detail: 'Persists evidence, incidents, immutable config versions, and outcomes.',
  },
  {
    label: 'Pipeline events',
    configured: present('INNGEST_EVENT_KEY') && present('INNGEST_SIGNING_KEY'),
    detail: 'Authenticates asynchronous event publication and pipeline execution.',
  },
  {
    label: 'Model provider',
    configured: present('OPENAI_API_KEY'),
    detail: 'Provides classification, assertions, and embeddings.',
  },
  {
    label: 'Replay boundary',
    configured: present('WINGMAN_RUNNER_ENDPOINT') && present('WINGMAN_RUNNER_TOKEN'),
    detail: 'Runs model-only verification inside the agent host without executing tools.',
  },
  {
    label: 'Agent handoff',
    configured: present('CODEX_APP_SERVER_ENDPOINT') && present('CODEX_APP_SERVER_TOKEN'),
    detail: 'Optional authenticated handoff for code-defect investigation.',
  },
]

const present = (name: string): boolean => Boolean(process.env[name]?.trim())
