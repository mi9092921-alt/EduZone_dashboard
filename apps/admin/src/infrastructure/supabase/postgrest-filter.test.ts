import { describe, expect, it } from 'vitest';

import { sanitizePostgrestSearchTerm } from './postgrest-filter';

describe('sanitizePostgrestSearchTerm', () => {
  it('leaves ordinary search text untouched', () => {
    expect(sanitizePostgrestSearchTerm('john doe')).toBe('john doe');
    expect(sanitizePostgrestSearchTerm('john@example.com')).toBe('john@example.com');
  });

  it('strips commas that would inject an extra .or() condition', () => {
    expect(sanitizePostgrestSearchTerm('x,account_status.eq.banned')).toBe(
      'x account_status.eq.banned',
    );
  });

  it('strips parentheses that would inject grouped conditions', () => {
    expect(sanitizePostgrestSearchTerm('a),or(id.neq.0')).toBe('a  or id.neq.0');
  });

  it('strips every occurrence, not just the first', () => {
    expect(sanitizePostgrestSearchTerm('a,b,c(d)e')).toBe('a b c d e');
  });

  it('handles empty input', () => {
    expect(sanitizePostgrestSearchTerm('')).toBe('');
  });
});
