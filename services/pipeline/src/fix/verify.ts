import {
  StageError,
  applyDiff,
  configDiffBytes,
  type AgentConfig,
  type AgentRunner,
  type Assertion,
  type AssertionContext,
  type ConfigDiff,
  type ConfigStore,
  type EventPublisher,
  type Ledger,
} from '@wingman/schema'

import { applyVerifiedCandidate } from '../apply.js'
import type { IncidentRecord, ObservedSession } from '../domain.js'
import { loggedStage, type StageLogger } from '../logging.js'
import { PIPELINE_POLICY } from '../policy.js'
import type { PipelineRepository } from '../repository.js'
import { runAssertion } from '../runner/index.js'
import type { FixAgent } from './agent.js'
import { enforceDiffBounds } from './bounds.js'
import { fixPrompt } from './prompt.js'

export interface FixVerificationInput {
  repository: PipelineRepository
  runner: AgentRunner
  configStore: ConfigStore
  fixAgent: FixAgent
  ledger: Ledger
  events: EventPublisher
  logger: StageLogger
  incident: IncidentRecord
  session: ObservedSession
  assertion: Assertion
  before: Awaited<ReturnType<PipelineRepository['saveRun']>>
  base: AgentConfig
  context: AssertionContext
}

export async function proposeAndVerify(input: FixVerificationInput): Promise<IncidentRecord> {
  const policy = await input.repository.getWritableConfigPolicy(input.incident.agentId)
  const priorArt = await input.ledger.priorArt(input.incident.fingerprint)
  const priorDiffs: ConfigDiff[] = []
  const startedAt = performance.now()
  for (let iteration = 1; iteration <= PIPELINE_POLICY.maxFixIterations; iteration += 1) {
    const timeoutMs = PIPELINE_POLICY.maxFixTimeMs - (performance.now() - startedAt)
    if (timeoutMs <= 0) throw new StageError('fix', 'LLM_UNAVAILABLE', true)
    const { candidate, diff } = await loggedStage({
      logger: input.logger,
      incidentId: input.incident.id,
      stage: 'fix',
      run: async () => {
        const proposed = await input.fixAgent.propose({
          prompt: fixPrompt({
            writablePaths: policy.writablePaths,
            assertion: input.assertion,
            failingRun: input.before,
            baseConfig: input.base,
            priorArt,
            priorDiffs,
          }),
          iteration,
          timeoutMs,
        })
        const diff = enforceDiffBounds({
          diff: proposed,
          maxDiffBytes: policy.maxDiffBytes,
          writablePaths: policy.writablePaths,
        })
        await input.configStore.assertWritable(input.incident.agentId, diff)
        priorDiffs.push(diff)
        const candidate = await input.repository.saveCandidate({
          incidentId: input.incident.id,
          diff,
          diffBytes: configDiffBytes(diff),
          baseVersionId: await input.repository.getBaseVersionId(input.incident.agentId),
          attempt: input.incident.attempt,
          iteration,
        })
        return { candidate, diff }
      },
      outcome: () => `ITERATION_${iteration}`,
    })
    const candidateConfig = applyDiff(input.base, diff)
    const verification = await loggedStage({
      logger: input.logger,
      incidentId: input.incident.id,
      stage: 'verify-pass',
      run: async () => {
        const afterResult = await runAssertion({
          runner: input.runner,
          assertion: input.assertion,
          config: candidateConfig,
          messages: input.session.turns,
          context: input.context,
        })
        await input.repository.saveRun({
          assertionId: input.assertion.id,
          incidentId: input.incident.id,
          phase: 'VERIFY_PASS',
          attempt: input.incident.attempt,
          configVersionId: null,
          candidateId: candidate.id,
          ...afterResult,
        })
        const suitePassed =
          afterResult.passCount >= PIPELINE_POLICY.verifyPassMinimumPasses
            ? await runPositiveSuite({
                ...input,
                candidateId: candidate.id,
                candidateConfig,
              })
            : false
        return { afterResult, suitePassed }
      },
      outcome: ({ afterResult, suitePassed }) =>
        `${afterResult.passCount}/${afterResult.n}:${suitePassed ? 'SUITE_PASS' : 'SUITE_FAIL'}`,
    })
    const { afterResult, suitePassed } = verification
    if (afterResult.passCount < PIPELINE_POLICY.verifyPassMinimumPasses) {
      await input.repository.updateCandidate(candidate.id, {
        state: 'REJECTED',
        rejectedReason: 'VERIFY_PASS_FAILED',
      })
      continue
    }
    if (!suitePassed) {
      await input.repository.updateCandidate(candidate.id, {
        state: 'REJECTED',
        rejectedReason: 'SUITE_REGRESSED',
      })
      throw new StageError('fix', 'SUITE_REGRESSED', false)
    }
    await input.repository.updateCandidate(candidate.id, { state: 'VERIFIED' })
    const incident = await input.repository.updateIncident(input.incident.id, 'ASSERTED', {
      state: 'CANDIDATE',
    })
    await loggedStage({
      logger: input.logger,
      incidentId: incident.id,
      stage: 'ledger',
      run: () =>
        input.ledger.record({
          incidentId: incident.id,
          fingerprint: incident.fingerprint,
          diff,
          outcome: 'VERIFIED',
        }),
      outcome: () => 'VERIFIED',
    })
    await input.events.publish(
      'candidate.ready',
      { data: { incidentId: incident.id, candidateId: candidate.id } },
      `candidate:${candidate.id}`,
    )
    if (incident.verdict === 'PREFERENCE') {
      await loggedStage({
        logger: input.logger,
        incidentId: incident.id,
        stage: 'apply',
        run: () =>
          applyVerifiedCandidate({
            ...input,
            incidentId: incident.id,
            scope: 'USER',
          }),
        outcome: () => 'USER',
      })
      return input.repository.getIncident(incident.id)
    }
    return incident
  }
  throw new StageError('fix', 'ITERATIONS_EXHAUSTED', false)
}

export function assertionContext(session: ObservedSession, rules: string[]): AssertionContext {
  const context = Object.fromEntries(
    Object.entries({
      viewFilters: session.viewFilters,
      selectedIds: session.selectedIds,
      dateRange: session.dateRange,
      lastQuery: session.lastQuery,
    }).filter(([, value]) => value !== undefined),
  ) as AssertionContext['session']
  return { session: context, user: { rules: session.userRules ?? rules } }
}

async function runPositiveSuite(
  input: FixVerificationInput & {
    candidateId: string
    candidateConfig: AgentConfig
  },
): Promise<boolean> {
  const assertions = await input.repository.listPositiveAssertions(input.incident.agentId)
  for (const assertion of assertions) {
    // A mined positive legitimately has no source session (DATA-MODEL.md §4).
    if (assertion.sourceSessionId === null) continue
    const session = await input.repository.getSession(assertion.sourceSessionId)
    const result = await runAssertion({
      runner: input.runner,
      assertion,
      config: input.candidateConfig,
      messages: session.turns,
      context: assertionContext(session, input.candidateConfig.rules),
      samples: 1,
    })
    await input.repository.saveRun({
      assertionId: assertion.id,
      incidentId: input.incident.id,
      phase: 'POSITIVE_SUITE',
      attempt: input.incident.attempt,
      configVersionId: null,
      candidateId: input.candidateId,
      ...result,
    })
    if (result.passCount !== result.n) return false
  }
  return true
}
