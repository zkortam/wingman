import { describe, expect, it } from 'vitest'

import { AMAZOFF_BASE_CONFIG, AMAZOFF_FIXED_CONFIG, CANCEL_AND_REBOOK_RULE } from './config.js'
import { resolveSelection, selectTool } from './select.js'

const RESCHEDULE = 'I need to reschedule my delivery to Friday'

describe('the defect the demo depends on', () => {
  it('cancels the order when asked to reschedule, and names the rule that caused it', () => {
    expect(selectTool(RESCHEDULE, AMAZOFF_BASE_CONFIG)).toEqual({
      tool: 'cancel_order',
      reason: 'RULE',
      rule: CANCEL_AND_REBOOK_RULE,
    })
  })

  it('reschedules once the rule is gone, so the repair is a behaviour change', () => {
    expect(selectTool(RESCHEDULE, AMAZOFF_FIXED_CONFIG)).toEqual({
      tool: 'reschedule_delivery',
      reason: 'DESCRIPTION',
      rule: null,
    })
  })

  it('is phrasing-robust, so a typed-in demo does not hinge on one sentence', () => {
    for (const utterance of [
      'can you move my delivery to Friday instead',
      'I want to change the delivery date',
      'please push my delivery back a day',
      'I need this to arrive aug 28',
      'I need this to arrive later',
    ]) {
      expect(selectTool(utterance, AMAZOFF_BASE_CONFIG)?.tool).toBe('cancel_order')
      expect(selectTool(utterance, AMAZOFF_FIXED_CONFIG)?.tool).toBe('reschedule_delivery')
    }
  })
})

describe('the rest of the agent, which the fix must not disturb', () => {
  it('still cancels when the customer actually asks to cancel', () => {
    for (const config of [AMAZOFF_BASE_CONFIG, AMAZOFF_FIXED_CONFIG]) {
      expect(selectTool('cancel my order', config)?.tool).toBe('cancel_order')
    }
  })

  it('routes lookups and returns unchanged by the repair', () => {
    expect(selectTool('look up my recent order', AMAZOFF_FIXED_CONFIG)?.tool).toBe('get_order')
    expect(selectTool('I want to return the shoes I received', AMAZOFF_FIXED_CONFIG)?.tool).toBe(
      'start_return',
    )
  })

  it('routes the conversational tools without stealing reschedule', () => {
    expect(selectTool("where's my package", AMAZOFF_FIXED_CONFIG)?.tool).toBe('track_package')
    expect(selectTool('please leave it at the door', AMAZOFF_FIXED_CONFIG)?.tool).toBe(
      'set_courier_note',
    )
    expect(selectTool('can I talk to a person', AMAZOFF_FIXED_CONFIG)?.tool).toBe('speak_to_human')
    expect(selectTool("where's my package", AMAZOFF_BASE_CONFIG)?.tool).toBe('track_package')
  })

  it('declines rather than guessing when nothing matches', () => {
    expect(selectTool('what is the weather', AMAZOFF_FIXED_CONFIG)).toBeNull()
  })
})

describe('rule handling', () => {
  it('does not fire a rule merely because it mentions a tool', () => {
    // "cancel the order" appears in the bad rule, but the rule is about delivery changes.
    expect(selectTool('cancel my order', AMAZOFF_BASE_CONFIG)?.reason).toBe('DESCRIPTION')
  })

  it('lets a corrective rule override the bad one, which is how a live fix lands', () => {
    // Wingman cannot know which of Amazoff's rules is at fault without analysis it does not have time.
    const repaired = {
      ...AMAZOFF_BASE_CONFIG,
      rules: [
        'When a customer asks to change or move a delivery, use reschedule_delivery.',
        ...AMAZOFF_BASE_CONFIG.rules,
      ],
    }
    expect(selectTool(RESCHEDULE, repaired)).toMatchObject({
      tool: 'reschedule_delivery',
      reason: 'RULE',
    })
    expect(repaired.rules).toContain(CANCEL_AND_REBOOK_RULE)
  })

  it('reads whatever rules the config carries rather than one known sentence', () => {
    const config = {
      ...AMAZOFF_FIXED_CONFIG,
      rules: ['If the customer mentions a refund, start a return first.'],
    }
    expect(selectTool('I would like a refund', config)).toEqual({
      tool: 'start_return',
      reason: 'RULE',
      rule: 'If the customer mentions a refund, start a return first.',
    })
  })

  it('does not let a model undo the defect the demo depends on', () => {
    const helpful = {
      tool: 'reschedule_delivery',
      reason: 'MODEL' as const,
      rule: 'The customer asked to change the date.',
    }
    const configured = selectTool(RESCHEDULE, AMAZOFF_BASE_CONFIG)
    expect(resolveSelection(helpful, configured)).toEqual({
      tool: 'cancel_order',
      reason: 'RULE',
      rule: CANCEL_AND_REBOOK_RULE,
    })
  })
})
