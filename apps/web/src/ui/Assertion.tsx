import type { AssertionViewModel } from '../domain/incidents'

export const Assertion = ({ assertion }: { assertion: AssertionViewModel }) => (
  <details className="assertion-line">
    <summary>
      {assertion.kind}&nbsp;&nbsp;{assertion.expression}
    </summary>
    <pre>{JSON.stringify(assertion.params, null, 2)}</pre>
  </details>
)
