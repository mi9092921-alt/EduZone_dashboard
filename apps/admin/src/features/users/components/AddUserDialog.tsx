'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';

import { useCreateUser } from '@/adapters/mutations/users.mutations';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Modal } from '@/components/ui/Modal';
import { Select, SelectItem } from '@/components/ui/Select';
import { getErrorMessage } from '@/domain/errors';
import { createUserSchema, type CreateUserInput } from '@/domain/schemas/user.schema';

interface AddUserDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddUserDialog({ open, onClose }: AddUserDialogProps) {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const createUser = useCreateUser();
  const [error, setError] = useState<string | null>(null);

  const ROLE_OPTIONS = [
    { value: 'student', label: t('role_student') },
    { value: 'teacher', label: t('role_teacher') },
    { value: 'admin', label: t('role_admin') },
    { value: 'super_admin', label: t('role_super_admin') },
  ];

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      first_name: '',
      last_name: '',
      phone: '',
      primary_role: 'student' as const,
      password: '',
    },
  });

  const onSubmit = async (data: CreateUserInput) => {
    setError(null);
    try {
      const result = await createUser.mutateAsync(data);
      if (!result.success) {
        setError(result.error || t('failed_create_user'));
        return;
      }
      reset();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('failed_create_user'));
    }
  };

  const handleClose = () => {
    reset();
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('add_new_user')}
      description={t('add_new_user_desc')}
      maxWidth="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={createUser.isPending || isSubmitting}
            className="font-bold uppercase tracking-wider text-[11px] text-muted-foreground"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            form="add-user-form"
            isLoading={createUser.isPending || isSubmitting}
            className="min-w-[140px] font-bold uppercase tracking-wider text-[11px]"
          >
            {t('create_user_btn')}
          </Button>
        </>
      }
    >
      <form
        id="add-user-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
        autoComplete="off"
      >
        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-semibold animate-in fade-in duration-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">{t('first_name_label')}</Label>
            <Controller
              name="first_name"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="first_name"
                  placeholder={t('first_name_placeholder')}
                  error={errors.first_name?.message}
                />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">{t('last_name_label')}</Label>
            <Controller
              name="last_name"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="last_name"
                  placeholder={t('last_name_placeholder')}
                  error={errors.last_name?.message}
                />
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t('email_label')}</Label>
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="email"
                type="email"
                placeholder={t('email_placeholder')}
                error={errors.email?.message}
              />
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">{t('phone_label')}</Label>
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="phone"
                placeholder={t('phone_placeholder')}
                error={errors.phone?.message}
              />
            )}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('primary_role_label')}</Label>
          <Controller
            name="primary_role"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </Select>
            )}
          />
          {errors.primary_role && (
            <p className="text-[10px] font-bold text-destructive uppercase tracking-widest ps-1">
              {errors.primary_role.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t('password_label')}</Label>
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder={t('password_placeholder')}
                error={errors.password?.message}
              />
            )}
          />
        </div>
      </form>
    </Modal>
  );
}
