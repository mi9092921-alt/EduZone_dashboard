import 'server-only';

import {
  extractYoutubeId,
  parseISO8601Duration,
  YOUTUBE_BATCH_LIMIT,
  YOUTUBE_FETCH_TIMEOUT_MS,
  YOUTUBE_METADATA_BATCH_ACTION_LIMIT,
  YOUTUBE_RATE_LIMIT_RETRY_DELAY_MS,
  type YouTubeBatchPartialFailure,
  type YouTubeBatchResult,
  type YouTubeVideoMetadata,
} from '@/infrastructure/youtube.utils';
import { getServerEnv } from '@/lib/env';

/**
 * YouTube Data API v3 client (SERVER-ONLY).
 *
 * P1 FIX (server/client boundary): this module holds `YOUTUBE_API_KEY` via
 * `getServerEnv()` and performs external network calls. The `server-only`
 * guard makes any client-bundled import fail the production build. Pure
 * helpers (ID extraction, duration parsing, constants, types) live in
 * `./youtube.utils` for browser consumption.
 */

export {
  extractYoutubeId,
  parseISO8601Duration,
  YOUTUBE_BATCH_LIMIT,
  YOUTUBE_FETCH_TIMEOUT_MS,
  YOUTUBE_METADATA_BATCH_ACTION_LIMIT,
  YOUTUBE_RATE_LIMIT_RETRY_DELAY_MS,
};
export type { YouTubeBatchPartialFailure, YouTubeBatchResult, YouTubeVideoMetadata };

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
    // exactOptionalPropertyTypes: true forbids `thumbnail_url: undefined`
    // on an optional (`?:`) field — the key must be omitted entirely when
    // no thumbnail is available, not present with an undefined value.
    ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
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
