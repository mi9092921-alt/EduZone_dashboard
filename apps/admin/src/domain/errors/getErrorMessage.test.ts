import { describe, it, expect } from 'vitest';

import { getErrorMessage } from './getErrorMessage';

describe('getErrorMessage', () => {
  it('extracts message from an Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns a plain string as-is', () => {
    expect(getErrorMessage('plain string error')).toBe('plain string error');
  });

  it('extracts message from an object with a string message field', () => {
    expect(getErrorMessage({ message: 'from object' })).toBe('from object');
  });

  it('falls back to a generic message for unrecognized shapes', () => {
    expect(getErrorMessage(42)).toBe('An unexpected error occurred');
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
    expect(getErrorMessage({ code: 'X' })).toBe('An unexpected error occurred');
  });
});
