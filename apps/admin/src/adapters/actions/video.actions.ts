'use server';

import { requirePermission } from '@/adapters/actions/boundary';
import {
  getYoutubeVideoDetails,
  getYoutubeVideoDetailsBatch,
  YOUTUBE_METADATA_BATCH_ACTION_LIMIT,
  type YouTubeBatchPartialFailure,
  type YouTubeVideoMetadata,
} from '@/infrastructure/youtube.service';

/**
 * Server action to fetch YouTube video metadata.
 * Keeps the YOUTUBE_API_KEY secure on the server.
 *
 * RB-1 FIX (release blocker): this used to be unauthenticated. Because
 * Next.js exposes `'use server'` exports as RPC endpoints reachable by any
 * HTTP client, an unauthenticated caller could invoke it to (a) drain the
 * shared YOUTUBE_API_KEY quota at EduZone's expense and (b) probe which
 * YouTube video IDs exist via timing/error differences. Now requires an
 * authenticated caller holding a course-editing permission (teacher / admin
 * / super_admin) — the same population that legitimately builds curricula.
 */
export type YoutubeMetadataSingleResult =
  | { success: true; data: YouTubeVideoMetadata | null }
  | { success: false; error: string };

export async function getYoutubeMetadataAction(urlOrId: string): Promise<YoutubeMetadataSingleResult> {
  try {
    await requirePermission(['courses.write', 'courses.manage']);
    const metadata = await getYoutubeVideoDetails(urlOrId);
    return { success: true, data: metadata };
  } catch (error) {
    console.error('[YoutubeAction] Failed to fetch metadata:', error);
    return { success: false, error: 'Failed to fetch video details' };
  }
}

export type YoutubeMetadataBatchSuccess = {
  success: true;
  /** Plain array (Maps are not serializable across the server-action boundary). */
  results: YouTubeVideoMetadata[];
  partial_failures: YouTubeBatchPartialFailure[];
};

export type YoutubeMetadataBatchResult = YoutubeMetadataBatchSuccess | { success: false; error: string };

/**
 * Server-action batch counterpart to {@link getYoutubeMetadataAction}.
 *
 * The lesson bulk-import path (`createLessons`) needs durations for many
 * videos at once. Resolving them one RPC per video would multiply latency
 * and quota usage, while calling `getYoutubeVideoDetailsBatch` directly
 * from the browser crashes on the `getServerEnv()` browser guard (the
 * YOUTUBE_API_KEY must stay server-side). This action keeps the key on the
 * server and returns plain JSON (no Maps) so it survives serialization.
 *
 * Same permission gate as the single-video action — prevents unauthenticated
 * callers from draining the shared API quota.
 */
export async function getYoutubeMetadataBatchAction(
  urlOrIds: string[],
): Promise<YoutubeMetadataBatchResult> {
  try {
    await requirePermission(['courses.write', 'courses.manage']);

    if (!Array.isArray(urlOrIds) || urlOrIds.length === 0) {
      return { success: true, results: [], partial_failures: [] };
    }
    if (urlOrIds.length > YOUTUBE_METADATA_BATCH_ACTION_LIMIT) {
      return {
        success: false,
        error: `Too many videos requested (max ${YOUTUBE_METADATA_BATCH_ACTION_LIMIT}).`,
      };
    }

    const batch = await getYoutubeVideoDetailsBatch(urlOrIds);
    return {
      success: true,
      results: [...batch.results.values()],
      partial_failures: batch.partial_failures,
    };
  } catch (error) {
    console.error('[YoutubeAction] Failed to fetch batch metadata:', error);
    return { success: false, error: 'Failed to fetch video details' };
  }
}
