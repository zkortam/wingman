/** Amazoff's order book. */
export type OrderStatus = 'PLACED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'

export interface Order {
  id: string
  customerId: string
  summary: string
  deliveryDate: string
  status: OrderStatus
  /** What the order was before it was cancelled, so a cancel can be undone. */
  statusBeforeCancel: OrderStatus | null
  address?: string
  tracking?: string | null
  carrier?: string
  instructions?: string | null
}

export interface OrderEvent {
  at: string
  orderId: string
  action: string
  detail: string
}

export class OrderBook {
  readonly #orders = new Map<string, Order>()
  readonly #events: OrderEvent[] = []
  #clock: () => string

  constructor(seed: readonly Order[] = [], clock: () => string = () => new Date().toISOString()) {
    for (const order of seed) this.#orders.set(order.id, hydrate(order))
    this.#clock = clock
  }

  get(orderId: string): Order | null {
    const order = this.#orders.get(orderId)
    return order ? { ...order } : null
  }

  forCustomer(customerId: string): Order[] {
    return [...this.#orders.values()]
      .filter((order) => order.customerId === customerId)
      .map((order) => ({ ...order }))
  }

  events(): OrderEvent[] {
    return this.#events.map((event) => ({ ...event }))
  }

  cancel(orderId: string): Order {
    const order = this.#require(orderId)
    if (order.status === 'CANCELLED') return { ...order }
    if (order.status === 'DELIVERED') throw new OrderError('A delivered order cannot be cancelled.')
    order.statusBeforeCancel = order.status
    order.status = 'CANCELLED'
    this.#log(orderId, 'cancel_order', `Order cancelled, was ${order.statusBeforeCancel}.`)
    return { ...order }
  }

  /** Reinstates a cancelled order before moving the date. */
  reschedule(orderId: string, deliveryDate: string): Order {
    const order = this.#require(orderId)
    if (order.status === 'DELIVERED')
      throw new OrderError('A delivered order cannot be rescheduled.')
    const reinstated = order.status === 'CANCELLED'
    if (reinstated) {
      order.status = order.statusBeforeCancel ?? 'PLACED'
      order.statusBeforeCancel = null
    }
    const previous = order.deliveryDate
    order.deliveryDate = deliveryDate
    this.#log(
      orderId,
      'reschedule_delivery',
      reinstated
        ? `Order reinstated and delivery moved from ${previous} to ${deliveryDate}.`
        : `Delivery moved from ${previous} to ${deliveryDate}.`,
    )
    return { ...order }
  }

  startReturn(orderId: string): Order {
    const order = this.#require(orderId)
    if (order.status !== 'DELIVERED') throw new OrderError('Only delivered orders can be returned.')
    this.#log(orderId, 'start_return', 'Return started.')
    return { ...order }
  }

  refund(orderId: string): Order {
    const order = this.#require(orderId)
    this.#log(orderId, 'issue_refund', 'Refund issued.')
    return { ...order }
  }

  setInstructions(orderId: string, instructions: string): Order {
    const order = this.#require(orderId)
    if (order.status === 'DELIVERED' || order.status === 'CANCELLED')
      throw new OrderError('Delivery notes can only be added while the order is on the way.')
    order.instructions = instructions
    this.#log(orderId, 'set_courier_note', instructions)
    return { ...order }
  }

  #require(orderId: string): Order {
    const order = this.#orders.get(orderId)
    if (!order) throw new OrderError(`Unknown order: ${orderId}`)
    return order
  }

  #log(orderId: string, action: string, detail: string): void {
    this.#events.push({ at: this.#clock(), orderId, action, detail })
  }
}

export class OrderError extends Error {}

function hydrate(order: Order): Order {
  return {
    address: '14 Filbert Street, San Francisco, CA 94107',
    tracking: order.status === 'PLACED' ? null : '1Z4417AMZ8821',
    carrier: 'Amazoff Logistics',
    instructions: null,
    ...order,
  }
}
