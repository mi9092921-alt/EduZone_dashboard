'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateOutlined, Event } from '@mui/icons-material';
import { Box, Button, ButtonGroup, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState, useId } from 'react';
import { useForm } from 'react-hook-form';

import { useExtendEnrollment } from '@/adapters/mutations/courses.mutations';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  extendEnrollmentSchema,
  type ExtendEnrollmentFormInput,
} from '@/domain/schemas/course.schema';

interface ExtendEnrollmentDialogProps {
  enrollmentId: string | null;
  courseId: string;
  studentName: string;
  currentExpiresAt?: string | null | undefined;
  open: boolean;
  onClose: () => void;
}

function getDefaultFutureDate(days = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return d.toISOString().slice(0, 16); // format: YYYY-MM-DDTHH:mm
}

export function ExtendEnrollmentDialog({
  enrollmentId,
  courseId,
  studentName,
  currentExpiresAt,
  open,
  onClose,
}: ExtendEnrollmentDialogProps) {
  const t = useTranslations('common');
  const dateInputId = useId();
  const extendMutation = useExtendEnrollment();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ExtendEnrollmentFormInput>({
    resolver: zodResolver(extendEnrollmentSchema),
    defaultValues: {
      new_expires_at: getDefaultFutureDate(30),
    },
  });

  const handleAddDays = (days: number) => {
    setValue('new_expires_at', getDefaultFutureDate(days), {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const onSubmit = async (data: ExtendEnrollmentFormInput) => {
    if (!enrollmentId) return;
    setError(null);
    try {
      await extendMutation.mutateAsync({
        enrollmentId,
        courseId,
        newExpiresAt: new Date(data.new_expires_at).toISOString(),
      });
      reset();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('failed_to_extend'));
    }
  };

  const handleClose = () => {
    if (!extendMutation.isPending) {
      reset();
      setError(null);
      onClose();
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={handleClose}
      onConfirm={handleSubmit(onSubmit)}
      title={t('extend_enrollment_title')}
      description={t('extend_confirm_msg', { name: studentName })}
      confirmLabel={t('extend_confirm_btn') || t('extend')}
      cancelLabel={t('cancel')}
      confirmColor="primary"
      isLoading={extendMutation.isPending}
      error={error}
      icon={<UpdateOutlined sx={{ fontSize: 22 }} />}
    >
      <div className="space-y-4 pt-2">
        {currentExpiresAt && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Event sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              {t('expiry_date_label')}: {new Date(currentExpiresAt).toLocaleDateString()}
            </Typography>
          </Box>
        )}

        <div className="space-y-2">
          <Label
            htmlFor={dateInputId}
            className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ps-1"
          >
            {t('new_expiry_label')}
          </Label>
          <Input
            {...register('new_expires_at')}
            id={dateInputId}
            type="datetime-local"
            error={errors.new_expires_at?.message}
            autoComplete="off"
          />
        </div>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontWeight: 700,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Quick Presets
          </Typography>
          <ButtonGroup size="small" variant="outlined" sx={{ width: '100%' }}>
            <Button sx={{ flex: 1 }} onClick={() => handleAddDays(30)}>
              +30 d
            </Button>
            <Button sx={{ flex: 1 }} onClick={() => handleAddDays(60)}>
              +60 d
            </Button>
            <Button sx={{ flex: 1 }} onClick={() => handleAddDays(90)}>
              +90 d
            </Button>
            <Button sx={{ flex: 1 }} onClick={() => handleAddDays(365)}>
              +1 yr
            </Button>
          </ButtonGroup>
        </Box>
      </div>
    </ConfirmDialog>
  );
}
