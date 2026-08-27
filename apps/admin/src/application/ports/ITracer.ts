/** Tracer port — distributed tracing for observability */
export interface ISpan {
  traceId: string;
  end(status: 'ok' | 'error', error?: unknown): void;
}

export interface ITracer {
  startSpan(name: string): ISpan;
}
