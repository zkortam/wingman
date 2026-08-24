'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { apiClient } from '../../data/api-client'
import { incidentPresentation, type IncidentDetailView } from '../../domain/incidents'
import { DEMO_AGENT, DEMO_REPORTER_HASH } from '../../domain/demo'
import { Assertion } from '../../ui/Assertion'
import { Confirm } from '../../ui/Confirm'
import { CopyId } from '../../ui/CopyId'
import { Diff } from '../../ui/Diff'
import { Dots } from '../../ui/Dots'
import { Evidence } from '../../ui/Evidence'
import { PageHeader } from '../../ui/PageHeader'
import { Toast } from '../../ui/Toast'
import { Verdict } from '../../ui/Verdict'

const ProofBlock = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section className="proof-block">
    <div className="proof-label">{label}</div>
    <div>{children}</div>
  </section>
)

interface IncidentProofProps {
  initialIncident: IncidentDetailView
  previousId?: string | undefined
  nextId?: string | undefined
  client?: Pick<typeof apiClient, 'apply' | 'dismiss' | 'handoff' | 'reopen' | 'revert'> | undefined
}

export const IncidentProof = ({ initialIncident, previousId, nextId, client = apiClient }: IncidentProofProps) => {
  const router = useRouter()
  const [incident, setIncident] = useState(initialIncident)
  const [confirm, setConfirm] = useState<'global' | 'revert' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [expandedEvidence, setExpandedEvidence] = useState(false)
  const [busy, setBusy] = useState(false)
  const presentation = useMemo(() => incidentPresentation(incident), [incident])
  const actions = presentation.actions

  const performApply = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await client.apply(incident.id, incident.scope ?? 'USER')
      setIncident((value) => ({ ...value, state: 'APPLIED', appliedAt: new Date().toISOString(), confirmation: { status: 'PENDING', detail: 'Confirmation window ends in 24h' } }))
      setToast('Applied to affected user')
    } catch {
      setToast('Apply failed. Nothing changed.')
    } finally {
      setBusy(false)
    }
  }

  const apply = (): void => {
    if (incident.scope === 'GLOBAL') setConfirm('global')
    else void performApply()
  }

  const dismiss = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await client.dismiss(incident.id, 'Dismissed by operator')
      setIncident((value) => ({ ...value, state: 'DISCARDED', stateReason: 'Dismissed by operator' }))
      setToast('Incident dismissed')
    } catch {
      setToast('Dismiss failed. Nothing changed.')
    } finally {
      setBusy(false)
    }
  }

  const revert = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await client.revert(DEMO_AGENT, DEMO_REPORTER_HASH)
      setIncident((value) => ({ ...value, state: 'REVERTED' }))
      setToast('Override reverted')
    } catch {
      setToast('Revert failed. Nothing changed.')
    } finally {
      setBusy(false)
    }
  }

  const reopen = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await client.reopen(incident.id)
      setIncident((value) => {
        const reopened = { ...value }
        delete reopened.stateReason
        return { ...reopened, state: 'CANDIDATE' }
      })
      setToast('Incident reopened')
    } catch {
      setToast('Reopen failed. Nothing changed.')
    } finally {
      setBusy(false)
    }
  }

  const completeConfirmation = (): void => {
    setIncident((value) => ({
      ...value,
      state: 'CONFIRMED',
      confirmedAt: new Date().toISOString(),
      confirmation: { status: 'CONFIRMED', detail: 'Confirmed by the next matching task, just now' },
    }))
  }

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (confirm) {
        if (event.key === 'Escape') setConfirm(null)
        return
      }
      if (busy) return
      if (event.key === 'a' && presentation.actions.includes('apply')) apply()
      if (event.key === 'x' && presentation.actions.includes('dismiss')) void dismiss()
      if (event.key === 'e') setExpandedEvidence((value) => !value)
      if (event.key === '[' && previousId) router.push(`/incidents/${previousId}`)
      if (event.key === ']' && nextId) router.push(`/incidents/${nextId}`)
      if (event.key === 'Escape') router.push('/inbox')
      if (event.key === 'c') void navigator.clipboard.writeText(incident.id)
    }
    const confirmListener = (): void => completeConfirmation()
    window.addEventListener('keydown', listener)
    window.addEventListener('outcome-confirmed', confirmListener)
    return () => {
      window.removeEventListener('keydown', listener)
      window.removeEventListener('outcome-confirmed', confirmListener)
    }
  }, [actions, busy, confirm, incident.id, nextId, previousId, router])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4_000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  return (
    <>
      <PageHeader
        title={<span className="incident-title-line"><CopyId id={incident.id} /><span>{incident.title}</span></span>}
        meta={`${incident.users} users | ${incident.sessions} sessions`}
        actions={
          <>
            <button disabled={!previousId} onClick={() => previousId && router.push(`/incidents/${previousId}`)} type="button">Previous</button>
            <button disabled={!nextId} onClick={() => nextId && router.push(`/incidents/${nextId}`)} type="button">Next</button>
            <button onClick={() => setExpandedEvidence((value) => !value)} type="button">{expandedEvidence ? 'Collapse evidence' : 'Expand evidence'}</button>
            {actions.includes('reopen') ? <button disabled={busy} onClick={() => void reopen()}>Reopen</button> : null}
            {actions.includes('retry') ? <button disabled={busy} onClick={() => void reopen()}>Retry</button> : null}
            {actions.includes('handoff') ? <><button onClick={() => void client.handoff(incident.id).then(({ payload }) => navigator.clipboard.writeText(payload)).then(() => setToast('Handoff payload copied')).catch(() => setToast('Copy failed'))}>Copy payload</button><button onClick={() => void client.handoff(incident.id).then(() => setToast('Handoff resent')).catch(() => setToast('Resend failed'))}>Resend</button></> : null}
            {actions.includes('dismiss') && !actions.includes('apply') ? <button disabled={busy} onClick={() => void dismiss()}>Dismiss</button> : null}
            {actions.includes('revert') ? <button className="danger-button" disabled={busy} onClick={() => setConfirm('revert')}>Revert</button> : null}
          </>
        }
      />
      <div aria-live="polite" className="incident-status" data-tone={presentation.tone}>{presentation.status}</div>
      <div className="proof">
        <ProofBlock label="EVIDENCE">
          <Evidence expanded={expandedEvidence} sessions={incident.evidence} />
        </ProofBlock>
        {presentation.show.verdict && incident.verdict ? <ProofBlock label="CLASSIFIED"><Verdict verdict={incident.verdict} /></ProofBlock> : null}
        {presentation.show.assertion && incident.assertion ? <ProofBlock label="ASSERTION"><Assertion assertion={incident.assertion} /></ProofBlock> : null}
        {presentation.show.before && incident.before ? (
          <ProofBlock label="BEFORE">
            {incident.state === 'ASSERTED' ? <span className="muted">Running verification</span> : <Dots n={incident.before.n} passCount={incident.before.passCount} />}
            {incident.state === 'DISCARDED' ? (
              <p className="refusal-copy">
                {incident.before.passCount === incident.before.n
                  ? 'The assertion passed every run. The detection was a false positive. Nothing was applied.'
                  : `Passed ${incident.before.passCount} of ${incident.before.n} runs against the unchanged config. Intermittent, not a defect. Nothing was applied.`}
              </p>
            ) : null}
          </ProofBlock>
        ) : null}
        {presentation.show.change && incident.change ? (
          <ProofBlock label="CHANGE">
            {incident.change.bytes > 4_096
              ? <span className="muted">Diff exceeds the 4 KB cap. Human approval required regardless of scope.</span>
              : <Diff path={incident.change.path} lines={incident.change.lines} />}
          </ProofBlock>
        ) : null}
        {presentation.show.after && incident.after ? (
          <ProofBlock label="AFTER">
            <div className="dots-line">
              <Dots n={incident.after.n} passCount={incident.after.passCount} />
              <span>|</span>
              <span className="suite-count">positive suite {incident.after.positiveSuitePassed}/{incident.after.positiveSuiteTotal} green</span>
            </div>
          </ProofBlock>
        ) : null}
        {incident.stateReason ? <ProofBlock label="REASON"><span className="park-reason">{incident.stateReason}</span></ProofBlock> : null}
        {presentation.show.handoff && incident.handoff ? <ProofBlock label="HANDOFF"><pre className="diff">{incident.handoff}</pre></ProofBlock> : null}
        {presentation.show.confirmation && incident.confirmation ? <ProofBlock label="CONFIRMATION"><div className="confirmation-line"><span>{incident.confirmation.detail}</span></div></ProofBlock> : null}
        {actions.includes('apply') ? (
          <ProofBlock label="SCOPE">
            <div className="scope-line">
              <span>{incident.scope === 'GLOBAL' ? 'All users' : `${incident.users} affected users`}</span>
              <div className="scope-actions">
                <button disabled={busy} onClick={() => void dismiss()}>Dismiss</button>
                {actions.includes('apply') ? <button className="primary-button" disabled={busy} onClick={apply}>{busy ? 'Applying' : incident.scope === 'GLOBAL' ? 'Apply globally' : 'Apply'}</button> : null}
              </div>
            </div>
          </ProofBlock>
        ) : null}
      </div>
      {confirm ? (
        <Confirm
          body={confirm === 'global' ? 'This changes the active config for every user.' : 'This restores the previous config for the affected user.'}
          destructive={confirm === 'revert'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'global') void performApply()
            else {
              void revert()
            }
            setConfirm(null)
          }}
          title={confirm === 'global' ? 'Apply globally?' : 'Revert this change?'}
        />
      ) : null}
      {toast ? <Toast message={toast} /> : null}
    </>
  )
}
