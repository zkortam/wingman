import type { EventName, EventPublisher, Events } from "@wingman/schema";

export class ReplayEventPublisher implements EventPublisher {
  readonly events: Array<{
    name: EventName;
    event: Events[EventName];
    idempotencyKey: string;
  }> = [];

  publish<Name extends EventName>(
    name: Name,
    event: Events[Name],
    idempotencyKey: string,
  ): Promise<void> {
    if (
      !this.events.some(
        (entry) =>
          entry.name === name && entry.idempotencyKey === idempotencyKey,
      )
    ) {
      this.events.push({
        name,
        event,
        idempotencyKey,
      } as (typeof this.events)[number]);
    }
    return Promise.resolve();
  }
}
