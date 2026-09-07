import { getServerEnv } from '@/lib/env';

/**
 * YouTube Service
 * Handles fetching video metadata and duration from YouTube API.
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

/**
 * Fetches video metadata from YouTube Data API v3.
 * Requires YOUTUBE_API_KEY environment variable.
 * Delegates to the batched implementation (PERF-06 FIX) so the single-video
 * path also benefits from the 8s timeout and the rate-limit retry.
 */
export async function getYoutubeVideoDetails(
  urlOrId: string,
  opts: { timeoutMs?: number; retryDelayMs?: number } = {},
): Promise<YouTubeVideoMetadata | null> {
  const videoId = extractYoutubeId(urlOrId);
  if (!videoId) return null;

  const { results } = await getYoutubeVideoDetailsBatch([urlOrId], opts);
  return results.get(videoId) ?? null;
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

interface YtItemShape {
  id: string;
  contentDetails?: { duration?: string };
  snippet?: {
    title?: string;
    thumbnails?: {
      maxres?: { url: string };
      high?: { url: string };
      default?: { url: string };
    };
  };
}

function toItemMetadata(item: YtItemShape): YouTubeVideoMetadata {
  const durationStr = item.contentDetails?.duration; // e.g. "PT1M5S"
  const thumbnailUrl =
    item.snippet?.thumbnails?.maxres?.url ||
    item.snippet?.thumbnails?.high?.url ||
    item.snippet?.thumbnails?.default?.url;

  return {
    id: item.id,
    title: item.snippet?.title || '',
    duration_sec: durationStr ? parseISO8601Duration(durationStr) : 0,
    thumbnail_url: thumbnailUrl,
  };
}

async function fetchVideoDetailsChunk(
  ids: string[],
  apiKey: string,
  timeoutMs: number,
  retryDelayMs: number,
  allowRateLimitRetry: boolean,
): Promise<{ items: YtItemShape[]; failures: Map<string, string> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${ids.join(',')}&part=contentDetails,snippet&key=${apiKey}`,
      { signal: controller.signal },
    );

    if (response.status === 429 && allowRateLimitRetry) {
      // Same transient-error retry convention used for Supabase calls in the
      // repo (fix-middleware-getuser-transient-error-retry): exactly one
      // retry after a short backoff, then accept the failure.
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return fetchVideoDetailsChunk(ids, apiKey, timeoutMs, retryDelayMs, false);
    }

    if (!response.ok) {
      // M10 convention: log the raw status; the surfaced reason stays generic.
      console.error(`[YouTubeService] API responded ${response.status}: ${response.statusText}`);
      return {
        items: [],
        failures: new Map(ids.map((id) => [id, `youtube_api_status_${response.status}`])),
      };
    }

    const data = (await response.json()) as { items?: YtItemShape[] };
    return { items: data.items ?? [], failures: new Map() };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? 'youtube_timeout'
        : 'youtube_network_error';
    console.error('[YouTubeService] Error fetching video details:', error);
    return { items: [], failures: new Map(ids.map((id) => [id, reason])) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches metadata for many videos in as few network calls as possible
 * (≤50 IDs per request). Resolves per-input partial failures instead of
 * throwing, so one bad video can never fail a whole import batch.
 */
export async function getYoutubeVideoDetailsBatch(
  urlOrIds: string[],
  opts: { timeoutMs?: number; retryDelayMs?: number } = {},
): Promise<YouTubeBatchResult> {
  const results = new Map<string, YouTubeVideoMetadata>();
  const partial_failures: YouTubeBatchPartialFailure[] = [];

  const apiKey = getServerEnv().YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn('[YouTubeService] Missing YOUTUBE_API_KEY environment variable.');
    for (const input of urlOrIds) {
      if (extractYoutubeId(input)) {
        partial_failures.push({ url_or_id: input, reason: 'youtube_api_key_missing' });
      }
    }
    return { results, partial_failures };
  }

  const timeoutMs = opts.timeoutMs ?? YOUTUBE_FETCH_TIMEOUT_MS;
  const retryDelayMs = opts.retryDelayMs ?? YOUTUBE_RATE_LIMIT_RETRY_DELAY_MS;

  // Resolve every input to a video ID, keeping the input → id mapping so
  // failures can be reported against the original inputs.
  const idByInput = new Map<string, string | null>();
  for (const input of urlOrIds) idByInput.set(input, extractYoutubeId(input));

  const uniqueIds = [...new Set([...idByInput.values()].filter((id): id is string => id !== null))];

  const failureById = new Map<string, string>();

  for (let i = 0; i < uniqueIds.length; i += YOUTUBE_BATCH_LIMIT) {
    const chunk = uniqueIds.slice(i, i + YOUTUBE_BATCH_LIMIT);
    const { items, failures } = await fetchVideoDetailsChunk(
      chunk,
      apiKey,
      timeoutMs,
      retryDelayMs,
      true,
    );

    for (const [id, reason] of failures) failureById.set(id, reason);
    for (const item of items) results.set(item.id, toItemMetadata(item));
  }

  // IDs the API answered with but did not include = not found (deleted /
  // private / typo) — an explicit per-video failure, not a batch failure.
  for (const id of uniqueIds) {
    if (!results.has(id) && !failureById.has(id)) {
      failureById.set(id, 'video_not_found');
    }
  }

  // Expand id-keyed outcomes back onto the original inputs.
  for (const [input, id] of idByInput) {
    if (id === null) {
      partial_failures.push({ url_or_id: input, reason: 'invalid_youtube_id' });
    } else if (failureById.has(id)) {
      partial_failures.push({ url_or_id: input, reason: failureById.get(id)! });
    }
  }

  return { results, partial_failures };
}
