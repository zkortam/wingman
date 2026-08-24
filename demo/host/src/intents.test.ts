import { describe, expect, it } from 'vitest'

import { expectedIntent, wantsRepairedReschedule } from './intents.js'

describe('expectedIntent', () => {
  it('keeps the demo defect family on reschedule_delivery', () => {
    for (const utterance of [
      'I need to reschedule my delivery to Friday',
      'can you move my delivery to Friday instead',
      'I want to change the delivery date',
      'please push my delivery back a day',
      'I need this to arrive aug 28',
    ]) {
      expect(expectedIntent(utterance)).toBe('reschedule_delivery')
    }
  })

  it('does not steal cancel, lookup, return, or the Germany gap', () => {
    expect(expectedIntent('cancel my order')).toBe('cancel_order')
    expect(expectedIntent('look up my recent order')).toBe('get_order')
    expect(expectedIntent('I want to return the shoes I received')).toBe('start_return')
    expect(expectedIntent('can you ship this to Germany instead')).toBe('change_shipping_country')
  })

  it('names the conversational tools', () => {
    expect(expectedIntent("Where's my package?")).toBe('track_package')
    expect(expectedIntent('Please leave it at the door')).toBe('set_courier_note')
    expect(expectedIntent('Can I talk to a person?')).toBe('speak_to_human')
  })
})

describe('wantsRepairedReschedule', () => {
  it('still catches the paraphrases after a live fix', () => {
    expect(wantsRepairedReschedule('make it aug 24', '2026-08-23', '2026-08-26')).toBe(true)
    expect(wantsRepairedReschedule('change the delivery date', '2026-08-23')).toBe(true)
    expect(wantsRepairedReschedule('I need this to arrive later', '2026-08-23')).toBe(true)
  })

  it('does not treat tracking or a doorstep note as another reschedule', () => {
    expect(wantsRepairedReschedule("where's my package", '2026-08-23', '2026-08-26')).toBe(false)
    expect(wantsRepairedReschedule("where's my delivery", '2026-08-23', '2026-08-26')).toBe(false)
    expect(wantsRepairedReschedule('leave it at the door', '2026-08-23')).toBe(false)
  })
})
