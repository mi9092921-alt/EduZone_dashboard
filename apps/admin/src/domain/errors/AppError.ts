import type { RpcErrorCode } from './codes';

/**
 * Base application error — all domain errors extend this.
 * Contains a typed error code for programmatic handling.
 */
export class AppError extends Error {
  public readonly name = 'AppError' as const;

  constructor(
    public readonly code: RpcErrorCode,
    message: string,
    public readonly detail?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** Human-readable representation for logging */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      detail: this.detail,
      requestId: this.requestId,
    };
  }
}
