'use client';

import { DeleteOutline, Image as ImageIcon, Upload } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { useAuthUser } from '@/adapters/stores/auth.store';
import { useToast } from '@/adapters/stores/toast.store';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  deleteCourseThumbnailByUrl,
  isAllowedThumbnailType,
  isWithinThumbnailSizeLimit,
  uploadCourseThumbnail,
} from '@/infrastructure/repos/course-thumbnails.storage';
import { cn } from '@/lib/utils';

interface CourseThumbnailFieldProps {
  value: string;
  onChange: (url: string) => void;
  error?: string | undefined;
  disabled?: boolean;
}

/**
 * Thumbnail editor used by CreateCourseDialog and CourseInfoForm: a live
 * preview rendered beside the thumbnail URL input, plus an upload button
 * that stores the picked image in the `course-thumbnails` bucket and fills
 * the URL field with its public URL (pasting a link still works).
 */
export function CourseThumbnailField({
  value,
  onChange,
  error,
  disabled = false,
}: CourseThumbnailFieldProps) {
  const t = useTranslations('common');
  const { showToast } = useToast();
  const user = useAuthUser();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  // URLs uploaded during this component session, not yet saved to the course.
  // Only these are safe to delete the moment they are superseded — the last
  // SAVED thumbnail (courses.thumbnail_url) stays untouched until the form
  // update commits (see CourseInfoForm.onSubmit).
  const sessionUploadsRef = useRef<Set<string>>(new Set());

  const hasImage = value.trim().length > 0 && !previewFailed;

  const cleanupSupersededUpload = (previousUrl: string) => {
    if (!previousUrl || !sessionUploadsRef.current.has(previousUrl)) return;
    sessionUploadsRef.current.delete(previousUrl);
    if (user?.id) void deleteCourseThumbnailByUrl(previousUrl, user.id);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // Read the selection BEFORE resetting: assigning value = '' clears the
    // input's files list, so resetting first would silently lose the file.
    // Resetting afterwards still allows re-picking the same file again.
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!isAllowedThumbnailType(file)) {
      showToast(t('thumbnail_bad_type'), 'error');
      return;
    }
    if (!isWithinThumbnailSizeLimit(file)) {
      showToast(t('thumbnail_too_large'), 'error');
      return;
    }
    if (!user?.id) {
      showToast(t('failed_to_save'), 'error');
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadCourseThumbnail(file, user.id);
      setPreviewFailed(false);
      cleanupSupersededUpload(value);
      onChange(url);
      sessionUploadsRef.current.add(url);
      showToast(t('thumbnail_upload_success'), 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : t('failed_to_save'), 'error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="thumbnail_url">{t('thumbnail_url_label')}</Label>
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div
          className={cn(
            'flex h-28 w-full sm:w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30',
            error ? 'border-destructive' : 'border-border',
          )}
        >
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- Same rationale as CoursesTable: the preview needs a native onError fallback for unavailable course images.
            <img
              src={value}
              alt={t('thumbnail_url_label')}
              className="h-full w-full object-cover"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs font-medium">{t('thumbnail_none')}</span>
            </div>
          )}
        </div>

        <div className="flex-1 w-full min-w-0 space-y-2">
          <Input
            id="thumbnail_url"
            value={value}
            onChange={(e) => {
              setPreviewFailed(false);
              onChange(e.target.value);
            }}
            error={error}
            placeholder={t('thumbnail_url_placeholder')}
            disabled={disabled || isUploading}
          />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || isUploading}
              isLoading={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-bold uppercase tracking-wider"
            >
              <Upload className="me-2 h-4 w-4" />
              {isUploading ? t('thumbnail_uploading') : t('thumbnail_upload')}
            </Button>
            {value.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled || isUploading}
                onClick={() => {
                  cleanupSupersededUpload(value);
                  onChange('');
                }}
                className="text-xs font-bold uppercase tracking-wider text-destructive hover:bg-destructive/10"
              >
                <DeleteOutline className="me-2 h-4 w-4" />
                {t('thumbnail_remove')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
