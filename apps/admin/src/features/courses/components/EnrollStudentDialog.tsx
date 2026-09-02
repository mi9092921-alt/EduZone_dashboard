'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Close } from '@mui/icons-material';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Alert,
  Autocomplete,
  Avatar,
  CircularProgress,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';

import { useEnrollStudent } from '@/adapters/mutations/courses.mutations';
import { useUsers } from '@/adapters/queries/users.queries';
import { enrollStudentSchema, type EnrollStudentFormInput } from '@/domain/schemas/course.schema';
import { getUserDisplayName } from '@/domain/types/user.types';


interface EnrollStudentDialogProps {
  courseId: string;
  open: boolean;
  onClose: () => void;
}

export function EnrollStudentDialog({ courseId, open, onClose }: EnrollStudentDialogProps) {
  const t = useTranslations('common');
  const enrollMutation = useEnrollStudent();
  const [error, setError] = useState<string | null>(null);

  // Search state for students
  const [userSearchText, setUserSearchText] = useState('');
  const { data: usersData, isLoading: isLoadingUsers } = useUsers(
    { primary_role: 'student', search: userSearchText },
    1,
    50
  );
  const students = usersData?.data || [];

  const {
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<EnrollStudentFormInput>({
    resolver: zodResolver(enrollStudentSchema),
    defaultValues: {
      user_id: '',
      course_id: courseId,
      expires_at: '',
    },
  });

  const onSubmit = async (data: EnrollStudentFormInput) => {
    setError(null);
    try {
      const mutationData: Parameters<typeof enrollMutation.mutateAsync>[0] = {
        userId: data.user_id,
        courseId: courseId,
      };
      if (data.expires_at) {
        mutationData.expiresAt = data.expires_at;
      }
      await enrollMutation.mutateAsync(mutationData);
      reset();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('enroll_student_error');
      setError(msg.includes('DUPLICATE') ? t('duplicate_enrollment_error') : msg);
    }
  };

  const handleClose = () => {
    if (!enrollMutation.isPending) {
      reset();
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, boxShadow: '0 16px 48px rgba(0,0,0,0.15)' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography component="span" variant="h6" sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
          {t('enroll_student_title')}
        </Typography>
        <IconButton size="small" onClick={handleClose} aria-label={t('close')} sx={{ color: 'text.secondary' }}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

            <Controller
              name="user_id"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={students}
                  getOptionLabel={(option) => `${getUserDisplayName(option)} (${option.email})`}
                  loading={isLoadingUsers}
                  onInputChange={(_, value) => setUserSearchText(value)}
                  onChange={(_, value) => field.onChange(value?.id || '')}
                  renderInput={(params) => {
                    const { InputLabelProps, InputProps, ...rest } = params;
                    return (
                      <TextField
                        {...rest}
                        label={t('select_student_label')}
                        autoFocus
                        error={!!errors.user_id}
                        helperText={errors.user_id?.message}
                        size="small"
                        placeholder={t('student_search_placeholder')}
                        InputLabelProps={InputLabelProps as { shrink?: boolean; className?: string }}
                        InputProps={{
                          ...InputProps,
                          endAdornment: (
                            <>
                              {isLoadingUsers ? <CircularProgress color="inherit" size={20} /> : null}
                              {InputProps.endAdornment}
                            </>
                          ),
                        }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                      />
                    );
                  }}
                  renderOption={(props, option) => {
                    const { key, ...optionProps } = props as React.HTMLAttributes<HTMLLIElement> & { key?: React.Key };
                    return (
                      <Box component="li" key={key ?? option.id} {...optionProps} sx={{ display: 'flex', gap: 1.5, py: 1 }}>
                        <Avatar src={option.avatar_url || ''} sx={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                          {option.first_name?.[0]}{option.last_name?.[0]}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{getUserDisplayName(option)}</Typography>
                          <Typography variant="caption" color="text.secondary">{option.email}</Typography>
                        </Box>
                      </Box>
                    );
                  }}
                />
              )}
            />

            <TextField
              label={t('expiry_date_label')}
              type="datetime-local"
              {...control.register('expires_at')}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
            onClick={handleClose}
            disabled={enrollMutation.isPending}
            sx={{ 
                textTransform: 'none', 
                fontWeight: 600, 
                color: 'text.secondary', 
                borderRadius: 2,
                '&:hover': { bgcolor: 'action.hover' }
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={enrollMutation.isPending}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              backgroundColor: 'primary.main',
              '&:hover': { backgroundColor: 'primary.dark' },
              boxShadow: 'none',
            }}
          >
            {enrollMutation.isPending ? t('enrolling_status') : t('enroll_student_btn')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
