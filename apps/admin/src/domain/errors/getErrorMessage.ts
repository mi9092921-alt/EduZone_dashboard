/**
 * Safely extract a human-readable message from a value caught in a
 * `catch` block. TypeScript types caught values as `unknown` (correctly —
 * JS lets you `throw` anything), so this avoids the common but unsound
 * `catch (error: any) { ... error.message }` pattern.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'An unexpected error occurred';
}
