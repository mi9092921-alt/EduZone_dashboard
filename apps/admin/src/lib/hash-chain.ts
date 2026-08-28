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
 * 3. At each step, attempt to re-compute the entry_hash from the log's content
 *    fields (primary tamper check).  If re-computation matches, great.  If it
 *    does not match — which can happen due to server-side jsonb::text serialisation
 *    differing from JSON.stringify — fall back to chain-linkage verification:
 *    confirm that the log's stored prev_hash equals the previous known hash.
 *    A broken prev_hash link is the definitive sign of tampering.
 *
 * Why chain-linkage is sufficient
 * ────────────────────────────────
 * If an attacker modifies a row's content they must also update entry_hash to
 * avoid detection.  But updating entry_hash breaks the next row's prev_hash
 * pointer.  The immutability trigger prevents any UPDATE/DELETE, so in practice
 * the only realistic attack vector (direct DB access) would still break the
 * chain.  Chain-linkage therefore provides meaningful tamper detection even when
 * hash re-computation is not possible due to serialisation differences.
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
  const verifiedIds = new Set<string>();

  // Walk the linked list by following prev_hash → entry_hash links
  while (byPrevHash.has(prevHash)) {
    const candidates = byPrevHash.get(prevHash)!;

    // ── Primary check: hash re-computation ──────────────────────────────
    // Find a candidate whose computed sha256 matches its stored entry_hash.
    let matched: ActivityLog | null = null;
    for (const log of candidates) {
      // Hash formula mirrors the server (flush_activity_logs):
      // v_new_seq::TEXT || v_row.id::TEXT || COALESCE(v_row.user_id::TEXT,'system')
      // || v_row.activity_type || v_row.details::TEXT || v_state.last_hash
      const userId = log.user_id ?? 'system';
      const detailsStr = JSON.stringify(log.details);
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
