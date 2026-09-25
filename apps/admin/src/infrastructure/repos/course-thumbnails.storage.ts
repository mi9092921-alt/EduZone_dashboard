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
