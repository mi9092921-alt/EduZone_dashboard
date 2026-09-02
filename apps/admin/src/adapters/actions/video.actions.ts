'use server';

import { getYoutubeVideoDetails } from '@/infrastructure/youtube.service';

/**
 * Server action to fetch YouTube video metadata.
 * Keeps the YOUTUBE_API_KEY secure on the server.
 */
export async function getYoutubeMetadataAction(urlOrId: string) {
  try {
    const metadata = await getYoutubeVideoDetails(urlOrId);
    return { success: true, data: metadata };
  } catch (error) {
    console.error('[YoutubeAction] Failed to fetch metadata:', error);
    return { success: false, error: 'Failed to fetch video details' };
  }
}
