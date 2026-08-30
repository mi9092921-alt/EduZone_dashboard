import type { IEventBus } from '@/application/ports/IEventBus';
import type { DomainEvent } from '@/domain/events/base';

type EventHandler = (event: DomainEvent<unknown>) => Promise<void>;

/**
 * In-memory event bus implementation.
 * Handlers are called asynchronously (fire-and-forget).
 * In production, this can be replaced with a queue-backed implementation.
 */
export class InMemoryEventBus implements IEventBus {
  private handlers = new Map<string, EventHandler[]>();

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    const eventHandlers = this.handlers.get(event.name) ?? [];
    // Fire all handlers in parallel, don't block the caller
    await Promise.allSettled(
      eventHandlers.map((handler) => handler(event as DomainEvent<unknown>)),
    );
  }

  subscribe<T>(
    eventName: string,
    handler: (event: DomainEvent<T>) => Promise<void>,
  ): void {
    const existing = this.handlers.get(eventName) ?? [];
    existing.push(handler as EventHandler);
    this.handlers.set(eventName, existing);
  }
}
