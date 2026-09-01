import type { IEventBus } from '@/application/ports/IEventBus';
import type { ILogger } from '@/application/ports/ILogger';
import type { ITracer } from '@/application/ports/ITracer';
import { InMemoryEventBus } from '@/infrastructure/event-bus/InMemoryEventBus';
import { ConsoleLogger } from '@/infrastructure/observability/ConsoleLogger';
import { NoopTracer } from '@/infrastructure/observability/NoopTracer';
import { createBrowserClient } from '@/infrastructure/supabase/client';

/**
 * Dependency Injection Container
 *
 * The ONLY file in the codebase that knows about all concrete implementations.
 * Features and adapters reference `container.*` to get implementations
 * typed through their port interfaces.
 */
export const container = {
  // ── Supabase client ──────────────────────────────────────────
  get supabase() {
    return createBrowserClient();
  },

  // ── Observability ────────────────────────────────────────────
  logger: new ConsoleLogger() as ILogger,
  tracer: new NoopTracer() as ITracer,

  // ── Event bus ────────────────────────────────────────────────
  eventBus: new InMemoryEventBus() as IEventBus,
};

