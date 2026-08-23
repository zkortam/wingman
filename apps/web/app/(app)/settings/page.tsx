import { PageHeader } from '../../../src/ui/PageHeader'

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" meta="Integration controls for Ops Copilot" />
      <section className="proof">
        <div className="proof-block"><div className="proof-label">KEYS</div><div><span className="mono">out_live_********8c2f</span><p className="muted">Used only to authenticate observations and config reads.</p></div></div>
        <div className="proof-block"><div className="proof-label">PERMISSION</div><div><span className="state-badge">APPLY | USER</span><p className="muted">Single-user config changes may be applied after fail-before and pass-after verification.</p></div></div>
        <div className="proof-block"><div className="proof-label">WRITABLE</div><div><span className="state-badge">rules</span> <span className="state-badge">tools.*.description</span><p className="muted">Outcome can never write outside these paths. Enforced in your process before anything is sent.</p></div></div>
        <div className="proof-block"><div className="proof-label">REDACTION</div><div className="mono">intent | toolName | toolArgs.recordId</div></div>
        <div className="proof-block"><div className="proof-label">CODEX</div><div className="mono">Not connected</div></div>
      </section>
    </>
  )
}
