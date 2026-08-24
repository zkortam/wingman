import { PrintButton } from '../../../src/features/outcomes/PrintButton'
import { reader } from '../../../src/server/container'
import { Assertion } from '../../../src/ui/Assertion'
import { Dots } from '../../../src/ui/Dots'
import { Empty } from '../../../src/ui/Empty'
import { PageHeader } from '../../../src/ui/PageHeader'
import { StateBadge } from '../../../src/ui/StateBadge'

export const dynamic = 'force-dynamic'

const date = (value: string | undefined): string => value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
  : 'Pending'

export default async function OutcomesPage() {
  const outcomes = await reader.listOutcomes()
  const confirmed = outcomes.filter((outcome) => outcome.state === 'CONFIRMED')
  const confirmationRate = outcomes.length > 0 ? Math.round((confirmed.length / outcomes.length) * 100) : 0
  const durations = confirmed.flatMap((outcome) => outcome.appliedAt && outcome.confirmedAt
    ? [new Date(outcome.confirmedAt).getTime() - new Date(outcome.appliedAt).getTime()]
    : []).sort((left, right) => left - right)
  const medianMinutes = durations.length > 0 ? Math.round((durations[Math.floor(durations.length / 2)] ?? 0) / 60_000) : 0
  return (
    <>
      <PageHeader title="Outcomes" meta="Verified changes and their production confirmation" actions={<PrintButton />} />
      <div className="stat-line outcomes-stats">
        <div><div className="stat-label">Confirmed this month</div><div className="stat-value">{confirmed.length}</div></div>
        <div><div className="stat-label">Confirmation rate</div><div className="stat-value">{confirmationRate}%</div></div>
        <div><div className="stat-label">Median apply-to-confirm</div><div className="stat-value">{medianMinutes}m</div></div>
      </div>
      {outcomes.length === 0 ? <Empty fact="No confirmed outcomes yet. The first one usually lands within a week of the first apply." /> : (
        <table className="data-table outcomes-table"><thead><tr><th scope="col">INCIDENT</th><th scope="col">SCOPE</th><th scope="col">USERS</th><th scope="col">APPLIED</th><th scope="col">CONFIRMED</th><th scope="col">STATUS</th></tr></thead><tbody>
          {outcomes.map((outcome) => <tr key={outcome.id}><td>{outcome.title}</td><td className="mono">{outcome.scope ?? 'USER'}</td><td>{outcome.users}</td><td>{date(outcome.appliedAt)}</td><td>{date(outcome.confirmedAt)}</td><td><StateBadge state={outcome.state} /></td></tr>)}
        </tbody></table>
      )}
      <section aria-label="Printable outcome receipts" className="print-outcomes">
        {outcomes.map((outcome) => <article className="outcome-receipt" key={outcome.id}>
          <h2>{outcome.title}</h2>
          <p className="mono">{outcome.id} | {outcome.users} users | {outcome.scope ?? 'USER'}</p>
          {outcome.assertion ? <Assertion assertion={outcome.assertion} /> : null}
          {outcome.before ? <div className="receipt-result"><strong>Before</strong><Dots n={outcome.before.n} passCount={outcome.before.passCount} /></div> : null}
          {outcome.after ? <div className="receipt-result"><strong>After</strong><Dots n={outcome.after.n} passCount={outcome.after.passCount} /></div> : null}
          <p>{outcome.state === 'CONFIRMED' ? 'Assertion verified | User outcome confirmed' : 'Applied | Confirmation pending'}</p>
        </article>)}
      </section>
    </>
  )
}
