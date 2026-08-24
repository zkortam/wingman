import { describe, expect, it } from 'vitest'

import { DEMO_AGENT, DEMO_CONTROL_HASH, DEMO_REPORTER_HASH } from '../domain/demo'
import { demoRuntime } from './demo-runtime'

describe('demoRuntime', () => {
  it('keeps the control config byte-identical after a user-scoped apply', () => {
    demoRuntime.reset()
    const controlBefore = demoRuntime.config(DEMO_AGENT, DEMO_CONTROL_HASH)
    demoRuntime.apply('OC-1042', 'USER')
    const reporter = demoRuntime.config(DEMO_AGENT, DEMO_REPORTER_HASH)
    const controlAfter = demoRuntime.config(DEMO_AGENT, DEMO_CONTROL_HASH)

    expect(reporter.version).toBe(2)
    expect(controlAfter).toEqual(controlBefore)
  })

  it('reverts the reporter override with a pointer swap', () => {
    demoRuntime.reset()
    demoRuntime.apply('OC-1042', 'USER')
    demoRuntime.revert(DEMO_REPORTER_HASH)
    expect(demoRuntime.config(DEMO_AGENT, DEMO_REPORTER_HASH).version).toBe(1)
    expect(demoRuntime.incident('OC-1042')?.state).toBe('REVERTED')
  })

  it('changes both users only after a global apply', () => {
    demoRuntime.reset()
    demoRuntime.apply('OC-1042', 'GLOBAL')
    expect(demoRuntime.config(DEMO_AGENT, DEMO_REPORTER_HASH).version).toBe(2)
    expect(demoRuntime.config(DEMO_AGENT, DEMO_CONTROL_HASH).version).toBe(2)
  })

  it('resets global state and persists reopen transitions', () => {
    demoRuntime.reset()
    demoRuntime.apply('OC-1042', 'GLOBAL')
    demoRuntime.reset()
    expect(demoRuntime.config(DEMO_AGENT, DEMO_CONTROL_HASH).version).toBe(1)
    demoRuntime.reopen('OC-1038')
    expect(demoRuntime.incident('OC-1038')?.state).toBe('CLUSTERED')
    expect(demoRuntime.incident('OC-1038')?.stateReason).toBe('OPERATOR_REOPENED')
  })
})
