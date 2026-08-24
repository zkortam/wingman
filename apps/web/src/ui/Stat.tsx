interface StatProps {
  value: string
  delta: string
  direction: 'up' | 'down'
  label: string
}

export const Stat = ({ value, delta, direction, label }: StatProps) => (
  <section className="stat" aria-label={label}>
    <div className="stat-label">{label}</div>
    <div className="stat-line">
      <span className="stat-value">{value}</span>
      <span className="stat-delta" data-direction={direction}>
        {direction === 'down' ? 'Down' : 'Up'} {delta} from last week
      </span>
    </div>
  </section>
)
