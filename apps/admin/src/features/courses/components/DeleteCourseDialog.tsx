'use client';

import { DeleteForever } from '@mui/icons-material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useDeleteCourse } from '@/adapters/mutations/courses.mutations';
import { useToastStore } from '@/adapters/stores/toast.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Course } from '@/domain/types/course.types';

interface DeleteCourseDialogProps {
  course: Course | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DeleteCourseDialog({ course, open, onClose, onSuccess }: DeleteCourseDialogProps) {
  const t = useTranslations('common');
  const deleteMutation = useDeleteCourse();
  const { showToast } = useToastStore();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!course) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(course.id);
      showToast(t('delete_success_msg', { title: course.title }), 'success');
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('failed_to_delete'));
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleDelete}
      title={t('delete_course_title')}
      description={t('delete_confirm', { title: course?.title ?? '' })}
      confirmLabel={t('delete')}
      cancelLabel={t('cancel')}
      confirmColor="error"
      isLoading={deleteMutation.isPending}
      error={error}
      icon={<DeleteForever sx={{ fontSize: 22 }} />}
    >
      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30">
        <p className="text-xs text-amber-800 dark:text-amber-400 font-medium leading-relaxed">
          {t('delete_warning')}
        </p>
      </div>
    </ConfirmDialog>
  );
}
