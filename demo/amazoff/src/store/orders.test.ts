import { describe, expect, it } from 'vitest'

import { OrderBook, OrderError, type Order } from './orders.js'

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'AMZ-4417',
  customerId: 'stevette',
  summary: 'Running shoes, size 8',
  deliveryDate: '2026-08-26',
  status: 'IN_TRANSIT',
  statusBeforeCancel: null,
  ...overrides,
})

const book = (seed = order()) => new OrderBook([seed], () => '2026-08-23T00:00:00.000Z')

describe('reversible cancellation', () => {
  it('remembers what the order was so a cancel can be undone', () => {
    const orders = book()
    expect(orders.cancel('AMZ-4417')).toMatchObject({
      status: 'CANCELLED',
      statusBeforeCancel: 'IN_TRANSIT',
    })
  })

  it('reinstates a cancelled order when it is rescheduled, which is the whole recovery', () => {
    const orders = book()
    orders.cancel('AMZ-4417')
    expect(orders.reschedule('AMZ-4417', '2026-08-28')).toMatchObject({
      status: 'IN_TRANSIT',
      statusBeforeCancel: null,
      deliveryDate: '2026-08-28',
    })
  })

  it('records that the reschedule reinstated the order, so the UI can say so', () => {
    const orders = book()
    orders.cancel('AMZ-4417')
    orders.reschedule('AMZ-4417', '2026-08-28')
    expect(orders.events().map((event) => event.detail)).toEqual([
      'Order cancelled, was IN_TRANSIT.',
      'Order reinstated and delivery moved from 2026-08-26 to 2026-08-28.',
    ])
  })

  it('does not claim a reinstatement when nothing was cancelled', () => {
    const orders = book()
    orders.reschedule('AMZ-4417', '2026-08-28')
    expect(orders.events()[0]?.detail).toBe('Delivery moved from 2026-08-26 to 2026-08-28.')
  })

  it('is idempotent on repeat cancels rather than losing the original status', () => {
    const orders = book()
    orders.cancel('AMZ-4417')
    orders.cancel('AMZ-4417')
    expect(orders.get('AMZ-4417')?.statusBeforeCancel).toBe('IN_TRANSIT')
  })
})

describe('limits that keep the mock honest', () => {
  it('refuses to cancel a delivered order', () => {
    const orders = book(order({ status: 'DELIVERED' }))
    expect(() => orders.cancel('AMZ-4417')).toThrow(OrderError)
  })

  it('refuses to reschedule a delivered order', () => {
    const orders = book(order({ status: 'DELIVERED' }))
    expect(() => orders.reschedule('AMZ-4417', '2026-08-28')).toThrow(OrderError)
  })

  it('only returns delivered orders', () => {
    const orders = book()
    expect(() => orders.startReturn('AMZ-4417')).toThrow(OrderError)
  })

  it('rejects unknown orders', () => {
    expect(() => book().cancel('AMZ-0000')).toThrow(OrderError)
  })

  it('hands out copies so callers cannot mutate the book directly', () => {
    const orders = book()
    const snapshot = orders.get('AMZ-4417')
    if (snapshot) snapshot.status = 'DELIVERED'
    expect(orders.get('AMZ-4417')?.status).toBe('IN_TRANSIT')
  })

  it('adds a delivery note only while the order is on the way', () => {
    const orders = book()
    expect(orders.setInstructions('AMZ-4417', 'leave at the door')).toMatchObject({
      instructions: 'leave at the door',
    })
    orders.cancel('AMZ-4417')
    expect(() => orders.setInstructions('AMZ-4417', 'porch')).toThrow(OrderError)
  })
})
