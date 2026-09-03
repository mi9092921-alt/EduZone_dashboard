import type { ITracer, ISpan } from '@/application/ports/ITracer';
import { container } from '@/container';

/**
 * Console-backed span (M13 — §17): closing a span emits one structured
 * entry with name, duration, result and the traceId — the correlation id
 * shared with audit events that carry the same requestId.
 */
class ConsoleSpan implements ISpan {
  public readonly traceId: string;
  private readonly startedAt = Date.now();

  constructor(private readonly name: string) {
    this.traceId = `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  end(status: 'ok' | 'error', error?: unknown): void {
    container.logger.info(`span:${this.name}`, {
      traceId: this.traceId,
      duration: Date.now() - this.startedAt,
      result: status,
      ...(error !== undefined && { error: error instanceof Error ? error.message : String(error) }),
    });
  }
}

/**
 * Default tracer — generates trace IDs and emits span timing entries
 * through the structured logger. Replaced by a Sentry/OTel tracer once
 * distributed tracing is wired (same port, drop-in implementation).
 */
export class NoopTracer implements ITracer {
  startSpan(name: string): ISpan {
    return new ConsoleSpan(name);
  }
}
