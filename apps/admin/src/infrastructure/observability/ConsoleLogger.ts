import type { ILogger } from '@/application/ports/ILogger';

/**
 * Console-based logger implementation.
 * Used in development. Replaced by SentryLogger in production.
 */
export class ConsoleLogger implements ILogger {
  info(message: string, context?: Record<string, unknown>): void {
    console.info(`[INFO] ${message}`, context ?? '');
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(`[WARN] ${message}`, context ?? '');
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    console.error(`[ERROR] ${message}`, error ?? '', context ?? '');
  }

  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(`[DEBUG] ${message}`, context ?? '');
  }
}
