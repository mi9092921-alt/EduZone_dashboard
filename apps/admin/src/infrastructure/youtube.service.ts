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
 */
export async function getYoutubeVideoDetails(
  urlOrId: string,
): Promise<YouTubeVideoMetadata | null> {
  const videoId = extractYoutubeId(urlOrId);
  if (!videoId) return null;

  const apiKey = getServerEnv().YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn('[YouTubeService] Missing YOUTUBE_API_KEY environment variable.');
    return null;
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails,snippet&key=${apiKey}`,
    );

    if (!response.ok) {
      // M10: the catch below logs the raw status; the thrown message stays
      // generic (upstream statusText could echo internal proxy details).
      console.error(`[YouTubeService] API responded ${response.status}: ${response.statusText}`);
      throw new Error('YouTube metadata unavailable');
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      return null;
    }

    const item = data.items[0];
    const durationStr = item.contentDetails?.duration; // e.g. "PT1M5S"
    const title = item.snippet?.title;
    const thumbnails = item.snippet?.thumbnails;
    const thumbnailUrl =
      thumbnails?.maxres?.url || thumbnails?.high?.url || thumbnails?.default?.url;

    return {
      id: videoId,
      title: title || '',
      duration_sec: durationStr ? parseISO8601Duration(durationStr) : 0,
      thumbnail_url: thumbnailUrl,
    };
  } catch (error) {
    console.error('[YouTubeService] Error fetching video details:', error);
    return null;
  }
}
