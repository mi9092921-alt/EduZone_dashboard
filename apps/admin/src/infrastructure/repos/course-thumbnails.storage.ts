import { ValidationError, mapDbError } from '@/domain/errors';
import { createBrowserClient } from '@/infrastructure/supabase/client';

/**
 * Course thumbnail uploads to the public `course-thumbnails` storage bucket.
 *
 * The bucket itself carries the security boundary (supabase/schema/
 * 10_permissions.sql): objects must live under the uploader's own <uid>/
 * folder and the session must pass public.check_dashboard_access(), so the
 * path below is not optional hardening — it is what the RLS policies match
 * on. Server-side enforcement stays in SQL; this module only shapes the
 * request to satisfy it and fails fast on client-checkable input.
 */

export const THUMBNAIL_BUCKET = 'course-thumbnails';

// Must match storage.buckets.file_size_limit for this bucket (5 MiB).
export const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;

// Must match storage.buckets.allowed_mime_types for this bucket.
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export function isAllowedThumbnailType(file: File): boolean {
  return ALLOWED_MIME_TYPES.has(file.type);
}

export function isWithinThumbnailSizeLimit(file: File): boolean {
  return file.size > 0 && file.size <= THUMBNAIL_MAX_BYTES;
}

/**
 * Uploads the image under `<uid>/<uuid>.<ext>` and returns its public URL,
 * ready to persist into `courses.thumbnail_url`. The URL ends with the file
 * extension, which the course Zod schema's image-extension regex accepts.
 */
export async function uploadCourseThumbnail(file: File, userId: string): Promise<string> {
  const extension = EXTENSION_BY_MIME[file.type];
  if (!extension) {
    throw new ValidationError('Unsupported thumbnail type. Use JPG, PNG, WebP, GIF or AVIF.');
  }

  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const supabase = createBrowserClient();

  const { error } = await supabase.storage
    .from(THUMBNAIL_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  // Storage failures (size/MIME/policy rejections) surface as a generic
  // infrastructure error; the raw cause stays in the console log.
  if (error) throw mapDbError(error, 'course-thumbnails.storage.ts');

  const { data } = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Extracts the `<uid>/<file>` object path from a course-thumbnails public
 * URL, or null when the URL does not point at this bucket.
 */
export function extractThumbnailObjectPath(url: string): string | null {
  const marker = `/storage/v1/object/public/${THUMBNAIL_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;

  const objectPath = url.slice(markerIndex + marker.length).split(/[?#]/)[0];
  if (!objectPath || objectPath.endsWith('/')) return null;
  return objectPath;
}

/**
 * Deletes a previously uploaded thumbnail object given its public URL.
 * No-op (returns false, never throws) when the URL is not one of this
 * bucket's public URLs, or when the object lives under a different user's
 * `<uid>/` folder — the storage DELETE policy only permits removing objects
 * the caller owns, so cross-owner and external URLs are deliberately left
 * untouched. Callers treat a false return as "nothing to clean up".
 */
export async function deleteCourseThumbnailByUrl(
  url: string,
  userId: string,
): Promise<boolean> {
  const objectPath = extractThumbnailObjectPath(url);
  if (!objectPath) return false;

  const ownerSegment = objectPath.split('/')[0];
  if (ownerSegment !== userId) return false;

  const supabase = createBrowserClient();
  const { error } = await supabase.storage.from(THUMBNAIL_BUCKET).remove([objectPath]);
  if (error) {
    // Orphan cleanup is best-effort housekeeping: a failed delete must not
    // surface as a course-save failure. The object remains in the bucket
    // and the raw cause is logged here.
    console.warn('[course-thumbnails] object delete failed:', error.message);
    return false;
  }
  return true;
}
