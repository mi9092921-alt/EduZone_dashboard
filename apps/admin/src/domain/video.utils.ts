import { VideoProvider } from './types/course.types';

export interface ParsedVideo {
  provider: VideoProvider;
  video_path: string;
}

/**
 * Single source of truth for extracting a YouTube video id from any current
 * URL shape: watch?v=ID, youtu.be/ID, /embed/ID, /v/ID, /shorts/ID, /live/ID.
 * `extractYoutubeId` (infrastructure/youtube.utils) reuses this so the two
 * parsers cannot drift — a miss here means a raw https:// URL reaches the
 * `lesson_contents_video_path_relative_only` DB check and the insert fails.
 */
export const YOUTUBE_VIDEO_ID_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:shorts|live|v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/**
 * Parses a full URL into a provider and a relative video path.
 * If it's already a clean ID/path, tries to guess or defaults to youtube.
 */
export function parseVideoUrl(url: string): ParsedVideo {
  if (!url) return { provider: 'youtube', video_path: '' };

  const cleanUrl = url.trim();

  // YouTube
  if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
    const match = cleanUrl.match(YOUTUBE_VIDEO_ID_REGEX);
    return {
      provider: 'youtube',
      video_path: match && match[1] ? match[1] : cleanUrl,
    };
  }

  // Vimeo
  if (cleanUrl.includes('vimeo.com')) {
    const regex = /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:[a-zA-Z0-9_-]+\/)?([0-9]+)/;
    const match = cleanUrl.match(regex);
    return {
      provider: 'vimeo',
      video_path: match && match[1] ? match[1] : cleanUrl,
    };
  }

  // Mux (stream.mux.com)
  if (cleanUrl.includes('stream.mux.com') || cleanUrl.includes('mux.com')) {
    const regex = /(?:https?:\/\/)?stream\.mux\.com\/([a-zA-Z0-9_-]+)(?:\.m3u8)?/;
    const match = cleanUrl.match(regex);
    let path = match && match[1] ? match[1] : cleanUrl;
    if (path.startsWith('https://'))
      path = path.replace('https://stream.mux.com/', '').replace('.m3u8', '');
    return {
      provider: 'mux',
      video_path: path,
    };
  }

  // Bunny (video.bunnycdn.com)
  if (cleanUrl.includes('bunnycdn.com') || cleanUrl.includes('b-cdn.net')) {
    const regex =
      /(?:https?:\/\/)?(?:video\.bunnycdn\.com\/play\/|.*?\.b-cdn\.net\/)([a-zA-Z0-9_-]+)/;
    const match = cleanUrl.match(regex);
    let path = match && match[1] ? match[1] : cleanUrl;
    if (path.startsWith('https://')) path = path.replace('https://video.bunnycdn.com/play/', '');
    return {
      provider: 'bunny',
      video_path: path,
    };
  }

  // S3 (s3.amazonaws.com or generic)
  if (cleanUrl.includes('s3.amazonaws.com') || cleanUrl.includes('s3.')) {
    let path = cleanUrl;
    if (path.startsWith('https://')) {
      // Just strip the protocol to keep it relative, or extract bucket/key
      path = path.replace(/^https?:\/\//, '');
    }
    return {
      provider: 's3',
      video_path: path,
    };
  }

  // Fallback if it looks like an 11-char YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
    return { provider: 'youtube', video_path: cleanUrl };
  }

  // Default fallback
  let path = cleanUrl;
  if (path.startsWith('https://') || path.startsWith('http://')) {
    path = path.replace(/^https?:\/\//, '');
  }
  return { provider: 'youtube', video_path: path };
}

/**
 * Formats a provider and relative video path into a full URL for display.
 */
export function formatVideoUrl(provider: VideoProvider | string, path: string): string {
  if (!path) return '';
  // If it's already a full URL, just return it
  if (/^https?:\/\//.test(path)) return path;

  switch (provider) {
    case 'youtube':
      return `https://youtu.be/${path}`;
    case 'vimeo':
      return `https://vimeo.com/${path}`;
    case 'mux':
      return `https://stream.mux.com/${path}.m3u8`;
    case 'bunny':
      return `https://video.bunnycdn.com/play/${path}`;
    case 's3':
      return `https://${path}`;
    default:
      return path;
  }
}

/**
 * Validates if the provided string is a supported video URL or ID.
 */
export function isValidVideoUrl(url: string): boolean {
  if (!url) return false;
  const parsed = parseVideoUrl(url);
  // As long as it has a path, we consider it valid because users could paste anything for S3/Mux
  return !!parsed.video_path;
}
