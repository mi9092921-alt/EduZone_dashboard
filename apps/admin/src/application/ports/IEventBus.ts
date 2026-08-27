import type { DomainEvent } from '@/domain/events/base';

/** Event bus port — decoupled side-effect dispatching */
export interface IEventBus {
  publish<T>(event: DomainEvent<T>): Promise<void>;
  subscribe<T>(eventName: string, handler: (event: DomainEvent<T>) => Promise<void>): void;
}
