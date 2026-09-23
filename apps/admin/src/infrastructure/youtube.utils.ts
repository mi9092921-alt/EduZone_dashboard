/**
 * YouTube pure helpers (CLIENT-SAFE).
 *
 * P1 FIX (server/client boundary): this module contains only pure functions,
 * constants and types — no API keys, no `getServerEnv()`, no network calls.
 * It is safe to import from client components, mutation hooks and other
 * browser-bundled modules (e.g. `courses.mutations` resolves video IDs
 * client-side before invoking the `video.actions` server boundary).
 *
 * The networked YouTube Data API client lives in `./youtube.service`
 * (server-only): it holds `YOUTUBE_API_KEY` via `getServerEnv()`.
 */

export interface YouTubeVideoMetadata {
  id: string;
  title: string;
  duration_sec: number;
  thumbnail_url?: string;
}

/**
 * Extracts YouTube Video ID from various URL formats.
 * Supported: youtube.com/watch?v=ID, youtu.be/ID, embed/ID, etc.
 */
export function extractYoutubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;

  // If it's already an ID (11 chars, alphanumeric + - _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) {
    return urlOrId;
  }

  const regex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = urlOrId.match(regex);
  return match ? (match[1] ?? null) : null;
}

/**
 * Parses ISO 8601 duration string (e.g., PT1M5S) to total seconds.
 */
export function parseISO8601Duration(duration: string): number {
  const regex = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
  const matches = duration.match(regex);

  if (!matches) return 0;

  const days = parseInt(matches[1] || '0', 10);
  const hours = parseInt(matches[2] || '0', 10);
  const minutes = parseInt(matches[3] || '0', 10);
  const seconds = parseInt(matches[4] || '0', 10);

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

// ── PERF-06 FIX: batched YouTube metadata ──────────────────────────
// One network call per chunk of ≤50 video IDs (YouTube Data API v3 limit)
// instead of one call per video, with an explicit 8s AbortController timeout
// (no more unbounded hangs) and a single short-backoff retry on HTTP 429.
// Failures are per-video partial failures — never a thrown exception that
// would drop the whole import batch.

export const YOUTUBE_BATCH_LIMIT = 50;
export const YOUTUBE_FETCH_TIMEOUT_MS = 8000;
export const YOUTUBE_RATE_LIMIT_RETRY_DELAY_MS = 2000;
/**
 * Cap for a single batch metadata server-action request — bounds shared
 * quota burn per RPC call. Lives here (not in the `'use server'` action
 * file) because Next.js forbids exporting non-function values from
 * `'use server'` modules.
 */
export const YOUTUBE_METADATA_BATCH_ACTION_LIMIT = 200;

export interface YouTubeBatchPartialFailure {
  url_or_id: string;
  reason: string;
}

export interface YouTubeBatchResult {
  /** Metadata keyed by resolved video ID. */
  results: Map<string, YouTubeVideoMetadata>;
  /** Inputs that could not be resolved (404, quota, timeout, invalid URL). */
  partial_failures: YouTubeBatchPartialFailure[];
}
