'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { revokeEnrollmentSchema, type RevokeEnrollmentFormInput } from '@/domain/schemas/course.schema';
import { useRevokeEnrollment } from '@/adapters/mutations/courses.mutations';
import type { Enrollment } from '@/domain/types/course.types';
import { getEnrollmentStudentName } from '@/domain/types/course.types';
import { useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Block } from '@mui/icons-material';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

interface RevokeEnrollmentDialogProps {
  enrollment: Enrollment | null;
  courseId: string;
  open: boolean;
  onClose: () => void;
}

export function RevokeEnrollmentDialog({
  enrollment,
  courseId,
  open,
  onClose,
}: RevokeEnrollmentDialogProps) {
  const t = useTranslations('common');
  const revokeMutation = useRevokeEnrollment();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RevokeEnrollmentFormInput>({
    resolver: zodResolver(revokeEnrollmentSchema),
    defaultValues: { reason: '' },
  });

  const onSubmit = async (data: RevokeEnrollmentFormInput) => {
    if (!enrollment) return;
    setError(null);
    try {
      await revokeMutation.mutateAsync({
        enrollmentId: enrollment.id,
        courseId,
        reason: data.reason,
      });
      reset();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('failed_to_revoke'));
    }
  };

  const handleClose = () => {
    if (!revokeMutation.isPending) {
      reset();
      setError(null);
      onClose();
    }
  };

  const studentName = enrollment ? getEnrollmentStudentName(enrollment) : '';

  return (
    <ConfirmDialog
      open={open}
      onClose={handleClose}
      onConfirm={handleSubmit(onSubmit)}
      title={t('revoke_enrollment_title')}
      description={t('revoke_confirm_msg', { name: studentName })}
      confirmLabel={t('revoke_confirm_btn') || t('revoke')}
      cancelLabel={t('cancel')}
      confirmColor="error"
      isLoading={revokeMutation.isPending}
      error={error}
      icon={<Block sx={{ fontSize: 22 }} />}
    >
      <div className="space-y-2 pt-2">
        <Label htmlFor="revoke-reason" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ps-1">
          {t('revocation_reason_label')}
        </Label>
        <Input
          {...register('reason')}
          id="revoke-reason"
          placeholder="Enter reason..."
          error={errors.reason?.message}
          autoComplete="off"
        />
      </div>
    </ConfirmDialog>
  );
}
