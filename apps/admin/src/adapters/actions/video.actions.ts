'use server';

import { requirePermission } from '@/adapters/actions/boundary';
import { getYoutubeVideoDetails } from '@/infrastructure/youtube.service';

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
export async function getYoutubeMetadataAction(urlOrId: string) {
  try {
    await requirePermission(['courses.write', 'courses.manage']);
    const metadata = await getYoutubeVideoDetails(urlOrId);
    return { success: true, data: metadata };
  } catch (error) {
    console.error('[YoutubeAction] Failed to fetch metadata:', error);
    return { success: false, error: 'Failed to fetch video details' };
  }
}
