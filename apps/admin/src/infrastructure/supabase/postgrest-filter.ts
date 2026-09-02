/**
 * Helpers for safely building PostgREST filter strings (the raw
 * `column.operator.value` syntax accepted by Supabase's `.or()`).
 *
 * `.or()` receives a single string where `,` separates conditions and
 * `(` / `)` group them. When a user-supplied free-text search term is
 * interpolated into that string without sanitization, a value containing
 * `,`, `(`, or `)` can inject additional filter conditions the caller never
 * intended (e.g. a search value of `x,account_status.eq.banned` widens the
 * query with an unrelated condition instead of being treated as literal
 * search text).
 *
 * This does NOT replace tenant/authorization scoping -- those must always
 * be applied as separate, non-interpolated `.eq()` filters. It only makes
 * the free-text term itself inert to the `.or()` grammar.
 */
export function sanitizePostgrestSearchTerm(value: string): string {
  return value.replace(/[,()]/g, ' ');
}
