import type { DiffLineView } from '../domain/incidents'

interface DiffProps {
  path: string
  lines: DiffLineView[]
}

export const Diff = ({ path, lines }: DiffProps) => (
  <div>
    <div className="diff-header">
      {lines.length}-line diff, {path}
    </div>
    <div className="diff" aria-label={`Configuration diff for ${path}`}>
      {lines.map((line, index) => (
        <div className="diff-line" data-kind={line.kind} key={`${line.kind}-${index}`}>
          <span className="diff-gutter">
            {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
          </span>
          <span>{line.text}</span>
        </div>
      ))}
    </div>
  </div>
)
