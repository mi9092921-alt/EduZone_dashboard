import type { ILogger } from '@/application/ports/ILogger';

/**
 * Console-based structured logger implementation (M13 — §17).
 *
 * Emits one JSON line per entry so server log ingestion (Sentry/Vercel)
 * can index the standard observability fields:
 *   requestId, userId, tenantId, action, resource, duration, result
 *
 * Redaction contract: keys matching SENSITIVE_KEY_RE are masked before
 * serialization — passwords, tokens, secrets and authorization headers
 * must never reach the log stream.
 */
export class ConsoleLogger implements ILogger {
  info(message: string, context?: Record<string, unknown>): void {
    console.info(JSON.stringify(this.entry('info', message, context)));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(JSON.stringify(this.entry('warn', message, context)));
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    console.error(
      JSON.stringify(
        this.entry('error', message, {
          ...context,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : error !== undefined
                ? String(error)
                : undefined,
        }),
      ),
    );
  }

  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(JSON.stringify(this.entry('debug', message, context)));
  }

  private entry(
    level: string,
    message: string,
    context?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...(context ? this.redact(context) : {}),
    };
  }

  /** Shallow redaction — masks sensitive keys at the top level of context. */
  private redact(context: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : value;
    }
    return out;
  }
}

const SENSITIVE_KEY_RE =
  /password|passwd|secret|token|authorization|auth_header|service_role|apikey|api_key|session_key/i;
