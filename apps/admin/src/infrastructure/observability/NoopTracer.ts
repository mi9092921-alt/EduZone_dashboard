import type { ITracer, ISpan } from '@/application/ports/ITracer';

/** Noop span — used in development when no tracing backend is configured */
class NoopSpan implements ISpan {
  public readonly traceId: string;

  constructor() {
    this.traceId = `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  end(_status: 'ok' | 'error', _error?: unknown): void {
    // noop
  }
}

/** Noop tracer — generates trace IDs but doesn't send spans anywhere */
export class NoopTracer implements ITracer {
  startSpan(_name: string): ISpan {
    return new NoopSpan();
  }
}
