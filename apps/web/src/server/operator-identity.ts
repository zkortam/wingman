import { DEMO_AGENT, DEMO_REPORTER_HASH } from '../domain/demo'

export interface OperatorIdentity {
  orgId: string
  agentId: string
  userHash: string
}

export const operatorIdentity = (): OperatorIdentity => {
  if (process.env.WINGMAN_RUNTIME === 'demo') {
    return { orgId: 'demo', agentId: DEMO_AGENT, userHash: DEMO_REPORTER_HASH }
  }
  const orgId = process.env.WINGMAN_ORG_ID?.trim()
  const agentId = process.env.WINGMAN_AGENT_ID?.trim()
  const userHash = process.env.WINGMAN_OPERATOR_USER_HASH?.trim()
  if (!orgId || !agentId || !userHash) {
    throw new Error('WINGMAN_ORG_ID, WINGMAN_AGENT_ID, and WINGMAN_OPERATOR_USER_HASH are required')
  }
  return { orgId, agentId, userHash }
}
