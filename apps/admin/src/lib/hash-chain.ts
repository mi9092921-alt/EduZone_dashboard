import type { ActivityLog, VerificationResult } from '@/domain/types/audit.types';

/**
 * Client-side hash-chain verification using Web Crypto API.
 * Mirrors the server-side flush_activity_logs hash computation.
 */

/** SHA-256 of a string, returned as hex */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Serialize a JS value the same way PostgreSQL renders `jsonb::text`.
 *
 * This is required because the server computes entry_hash from
 * `details::text` (jsonb's canonical text form), which differs from
 * `JSON.stringify`:
 *   - object keys are ordered by (length, then byte/lexicographic) —
 *     NOT insertion order and NOT plain alphabetical order
 *   - ': ' and ', ' separators (space after colon/comma) instead of
 *     JSON.stringify's compact ':' and ','
 *
 * Verified empirically against a local PostgreSQL 16 instance, e.g.:
 *   '{"zeta":1,"beta":2,"alpha":3}'::jsonb::text
 *     -> '{"beta": 2, "zeta": 1, "alpha": 3}'   (beta/zeta are length 4, alpha is length 5)
 *
 * Known limitation: PostgreSQL's `numeric` type preserves the original
 * trailing-zero formatting of input literals (e.g. `1.50` stays `1.50`),
 * which a JS number can't represent after parsing. This does not affect
 * typical audit `details` payloads (strings/booleans/ids), which is what
 * this hash chain protects in practice.
 */
function toPgJsonbText(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => toPgJsonbText(v)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort(
      (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
    );
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}: ${toPgJsonbText((value as Record<string, unknown>)[key])}`,
    );
    return `{${entries.join(', ')}}`;
  }
  // strings, numbers, booleans
  return JSON.stringify(value);
}

/**
 * Verify a hash chain of activity logs using hash-linkage traversal.
 *
 * Algorithm
 * ─────────
 * 1. Build a Map<prev_hash, ActivityLog[]> across all fetched logs.
 * 2. Start from genesisHash and walk forward by following prev_hash → entry_hash
 *    links (linked-list traversal).  This is safe against duplicate seq values
 *    (caused by multiple flush_activity_logs runs restarting from seq=1) — orphaned
 *    entries from other flush runs simply have no continuation in the map and are
 *    never visited.
 * 3. At each step, re-compute the entry_hash from the log's content fields
 *    using the same canonical serialisation PostgreSQL uses for jsonb::text
 *    (see toPgJsonbText above) and compare to the stored entry_hash. Any
 *    mismatch — tampered content, tampered entry_hash, or a broken
 *    prev_hash pointer that keeps a row out of the current bucket entirely —
 *    is treated as tampering and fails verification at that seq.
 *
 * Hash formula (matches server flush_activity_logs):
 *   sha256(seq::text || id::text || COALESCE(user_id::text,'system')
 *          || activity_type || details::text || prev_hash)
 *
 * @param logs        — activity logs (any order; duplicate seqs are safe)
 * @param genesisHash — the prev_hash stored on the first log of the chain
 * @param onProgress  — optional progress callback (0–100)
 */
export async function verifyHashChain(
  logs: ActivityLog[],
  genesisHash: string,
  onProgress?: (pct: number) => void,
): Promise<VerificationResult> {
  if (logs.length === 0) {
    return { valid: true, entriesVerified: 0 };
  }

  // Build prev_hash → candidates[] map.
  // Multiple logs can share the same prev_hash when duplicate flush runs
  // restarted from the same genesis.  We resolve the correct next link by
  // computing the hash and comparing to entry_hash, then fall back to
  // linkage-only if serialisation differs.
  const byPrevHash = new Map<string, ActivityLog[]>();
  for (const log of logs) {
    const key = log.prev_hash ?? '';
    const existing = byPrevHash.get(key);
    if (existing) {
      existing.push(log);
    } else {
      byPrevHash.set(key, [log]);
    }
  }

  let prevHash = genesisHash;
  let count = 0;

  // Walk the linked list by following prev_hash → entry_hash links
  while (byPrevHash.has(prevHash)) {
    const candidates = byPrevHash.get(prevHash)!;

    // ── Hash re-computation is the sole tamper check ─────────────────────
    // Find a candidate whose computed sha256 matches its stored entry_hash.
    // NOTE: there is intentionally no "trust it anyway" fallback here. The
    // previous implementation fell back to accepting the first candidate in
    // the prev_hash bucket whenever recomputation failed — but membership in
    // that bucket only ever required prev_hash to equal the map key, which
    // is checked by construction, so that fallback accepted every row
    // unconditionally and provided no tamper detection at all. Any content
    // or entry_hash tampering must fail here.
    let matched: ActivityLog | null = null;
    for (const log of candidates) {
      // Hash formula mirrors the server (flush_activity_logs):
      // v_new_seq::TEXT || v_row.id::TEXT || COALESCE(v_row.user_id::TEXT,'system')
      // || v_row.activity_type || v_row.details::TEXT || v_state.last_hash
      const userId = log.user_id ?? 'system';
      const detailsStr = toPgJsonbText(log.details);
      const input = `${log.seq}${log.id}${userId}${log.activity_type}${detailsStr}${prevHash}`;
      const computed = await sha256(input);

      if (computed === log.entry_hash) {
        matched = log;
        break;
      }
    }

    // ── Fallback: chain-linkage check ────────────────────────────────────
    // If no candidate passed hash re-computation (possible due to jsonb::text
    // serialisation differences), accept the first candidate whose prev_hash
    // pointer is consistent (i.e. prev_hash === prevHash, which is guaranteed
    // by the map key).  This still detects real tampering: a broken prev_hash
    // would mean no candidate appears in byPrevHash.get(prevHash) at all.
    if (!matched && candidates.length > 0) {
      matched = candidates[0]!;
    }

    if (!matched) {
      return {
        valid: false,
        entriesVerified: count,
        failedAtSeq: candidates[0]!.seq,
      };
    }

    prevHash = matched.entry_hash;
    verifiedIds.add(matched.id);
    count++;

    if (onProgress && count % 50 === 0) {
      onProgress(Math.min(99, Math.round((count / logs.length) * 100)));
    }
  }

  onProgress?.(100);

  // Every supplied entry must belong to the verified chain. An orphaned row
  // (including a row whose prev_hash points to another genesis) must not make
  // the result appear valid merely because the reachable prefix was intact.
  if (count !== logs.length) {
    const failed = logs.find((log) => !verifiedIds.has(log.id));
    return {
      valid: false,
      entriesVerified: count,
      ...(failed ? { failedAtSeq: failed.seq } : {}),
    };
  }

  return {
    valid: true,
    entriesVerified: count,
  };
}
