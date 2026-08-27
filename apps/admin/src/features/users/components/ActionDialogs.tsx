'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Lock,
  PauseCircle,
  Block,
  Warning,
  ExitToApp,
  DevicesOther,
  DeleteForever,
} from '@mui/icons-material';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToastStore } from '@/adapters/stores/toast.store';
import {
  lockUserSchema,
  suspendUserSchema,
  banUserSchema,
  issueWarningSchema,
  type LockUserInput,
  type SuspendUserInput,
  type BanUserInput,
  type IssueWarningInput,
} from '@/domain/schemas/user.schema';
import type { User } from '@/domain/types/user.types';
import { getUserDisplayName } from '@/domain/types/user.types';
import {
  useMutateUserAccount,
  useTerminateSessions,
  useResetDevices,
  useMutateWarning,
  useDeleteUser,
} from '@/adapters/mutations/users.mutations';
import { parseRpcError } from '@/domain/errors';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectItem } from '@/components/ui/Select';
import { useTranslations } from 'next-intl';

// ── Lock Dialog ──────────────────────────────────────────────────
export function LockUserDialog({
  user,
  open,
  onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('users');
  const { showToast } = useToastStore();
  const mutation = useMutateUserAccount();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LockUserInput>({
    resolver: zodResolver(lockUserSchema),
    defaultValues: { reason: '' },
  });

  const onSubmit = (data: LockUserInput) => {
    if (!user) return;
    mutation.mutate(
      { userId: user.id, action: 'lock', reason: data.reason },
      {
        onSuccess: () => {
          showToast(t('lock_user_success', { name: getUserDisplayName(user) }), 'success');
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      onConfirm={handleSubmit(onSubmit)}
      title={t('lock_user_title', { name: user ? getUserDisplayName(user) : 'User' })}
      description={t('lock_user_desc')}
      confirmLabel={t('lock_account_btn')}
      confirmColor="warning"
      isLoading={mutation.isPending}
      error={mutation.error ? parseRpcError(mutation.error).message : null}
      icon={<Lock sx={{ fontSize: 22 }} />}
    >
      <div className="space-y-2 mt-2">
        <Label htmlFor="lock-reason">{t('lock_reason_label')}</Label>
        <Controller
          name="reason"
          control={control}
          render={({ field }) => (
            <Input
              {...field}
              id="lock-reason"
              placeholder={t('lock_reason_placeholder')}
              error={errors.reason?.message}
            />
          )}
        />
      </div>
    </ConfirmDialog>
  );
}

// ── Suspend Dialog ───────────────────────────────────────────────
export function SuspendUserDialog({
  user,
  open,
  onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('users');
  const mutation = useMutateUserAccount();
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<SuspendUserInput>({
    resolver: zodResolver(suspendUserSchema),
    defaultValues: { reason: '', suspend_hours: 24 },
  });

  const { showToast } = useToastStore();
  const hours = watch('suspend_hours');
  const untilDate = hours
    ? new Date(Date.now() + hours * 3600_000).toLocaleString()
    : null;

  const onSubmit = (data: SuspendUserInput) => {
    if (!user) return;
    mutation.mutate(
      {
        userId: user.id,
        action: 'suspend',
        reason: data.reason,
        suspendHours: data.suspend_hours,
      },
      {
        onSuccess: () => {
          showToast(t('suspend_user_success', { name: getUserDisplayName(user) }), 'success');
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      onConfirm={handleSubmit(onSubmit)}
      title={t('suspend_user_title', { name: user ? getUserDisplayName(user) : 'User' })}
      description={t('suspend_user_desc')}
      confirmLabel={t('suspend_account_btn')}
      confirmColor="warning"
      isLoading={mutation.isPending}
      error={mutation.error ? parseRpcError(mutation.error).message : null}
      icon={<PauseCircle sx={{ fontSize: 22 }} />}
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="suspend-reason">{t('lock_reason_label')}</Label>
          <Controller
            name="reason"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="suspend-reason"
                placeholder={t('suspend_reason_placeholder')}
                error={errors.reason?.message}
              />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="suspend-hours">{t('duration_hours_label')}</Label>
          <Controller
            name="suspend_hours"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="suspend-hours"
                type="number"
                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                min={1}
                max={720}
                error={errors.suspend_hours?.message}
              />
            )}
          />
          {untilDate && (
            <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest ps-1">
              {t('suspended_until', { date: untilDate })}
            </p>
          )}
        </div>
      </div>
    </ConfirmDialog>
  );
}

// ── Ban Dialog ───────────────────────────────────────────────────
export function BanUserDialog({
  user,
  open,
  onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('users');
  const { showToast } = useToastStore();
  const mutation = useMutateUserAccount();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BanUserInput>({
    resolver: zodResolver(banUserSchema),
    defaultValues: { reason: '', confirm_text: '' as any },
  });

  const onSubmit = (data: BanUserInput) => {
    if (!user) return;
    mutation.mutate(
      { userId: user.id, action: 'ban', reason: data.reason },
      {
        onSuccess: () => {
          showToast(t('ban_user_success', { name: getUserDisplayName(user) }), 'success');
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      onConfirm={handleSubmit(onSubmit)}
      title={t('ban_user_title', { name: user ? getUserDisplayName(user) : 'User' })}
      description={t('ban_user_desc')}
      confirmLabel={t('ban_permanently_btn')}
      confirmColor="error"
      isLoading={mutation.isPending}
      error={mutation.error ? parseRpcError(mutation.error).message : null}
      icon={<Block sx={{ fontSize: 22 }} />}
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="ban-reason">{t('lock_reason_label')}</Label>
          <Controller
            name="reason"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="ban-reason"
                placeholder={t('ban_reason_placeholder')}
                error={errors.reason?.message}
              />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ban-confirm">{t('ban_confirm_label')}</Label>
          <Controller
            name="confirm_text"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="ban-confirm"
                placeholder={t('ban_confirm_placeholder')}
                error={errors.confirm_text?.message}
              />
            )}
          />
        </div>
      </div>
    </ConfirmDialog>
  );
}

// ── Issue Warning Dialog ─────────────────────────────────────────
export function IssueWarningDialog({
  user,
  open,
  onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('users');
  const { showToast } = useToastStore();
  const mutation = useMutateWarning();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IssueWarningInput>({
    resolver: zodResolver(issueWarningSchema),
    defaultValues: { reason: '', severity: 1, action: 'none' },
  });

  const onSubmit = (data: IssueWarningInput) => {
    if (!user) return;
    mutation.mutate(
      {
        userId: user.id,
        reason: data.reason,
        severity: data.severity,
        action: data.action,
      },
      {
        onSuccess: () => {
          showToast(t('warn_user_success', { name: getUserDisplayName(user) }), 'success');
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      onConfirm={handleSubmit(onSubmit)}
      title={t('issue_warning_title', { name: user ? getUserDisplayName(user) : 'User' })}
      description={t('issue_warning_desc', { count: user?.warning_count ?? 0 })}
      confirmLabel={t('issue_warning_btn')}
      confirmColor="warning"
      isLoading={mutation.isPending}
      error={mutation.error ? parseRpcError(mutation.error).message : null}
      icon={<Warning sx={{ fontSize: 22 }} />}
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="warning-reason">{t('lock_reason_label')}</Label>
          <Controller
            name="reason"
            control={control}
            render={({ field }) => (
              <Input
                {...field}
                id="warning-reason"
                placeholder={t('warning_reason_placeholder')}
                error={errors.reason?.message}
              />
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('severity_label')}</Label>
            <Controller
              name="severity"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value?.toString() || '1'}
                  onValueChange={(val: string) => field.onChange(parseInt(val) || 1)}
                >
                  <SelectItem value="1">{t('severity_low')}</SelectItem>
                  <SelectItem value="2">{t('severity_medium')}</SelectItem>
                  <SelectItem value="3">{t('severity_high')}</SelectItem>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('action_label')}</Label>
            <Controller
              name="action"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || 'none'}
                  onValueChange={field.onChange}
                >
                  <SelectItem value="none">{t('action_none')}</SelectItem>
                  <SelectItem value="notify">{t('action_notify')}</SelectItem>
                  <SelectItem value="restrict">{t('action_restrict')}</SelectItem>
                </Select>
              )}
            />
          </div>
        </div>
      </div>
    </ConfirmDialog>
  );
}

// ── Terminate Sessions Dialog ────────────────────────────────────
export function TerminateSessionsDialog({
  user,
  open,
  onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('users');
  const { showToast } = useToastStore();
  const mutation = useTerminateSessions();

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => {
        if (!user) return;
        mutation.mutate(
          { userId: user.id },
          { 
            onSuccess: () => {
              showToast(t('terminate_sessions_success', { name: getUserDisplayName(user) }), 'success');
              onClose();
            } 
          },
        );
      }}
      title={t('terminate_sessions_title')}
      description={t('terminate_sessions_desc', { name: user ? getUserDisplayName(user) : 'this user' })}
      confirmLabel={t('terminate_sessions_btn')}
      confirmColor="error"
      isLoading={mutation.isPending}
      error={mutation.error ? parseRpcError(mutation.error).message : null}
      icon={<ExitToApp sx={{ fontSize: 22 }} />}
    />
  );
}

// ── Reset Devices Dialog ─────────────────────────────────────────
export function ResetDevicesDialog({
  user,
  open,
  onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('users');
  const { showToast } = useToastStore();
  const mutation = useResetDevices();

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => {
        if (!user) return;
        mutation.mutate(
          { userId: user.id },
          { 
            onSuccess: () => {
              showToast(t('reset_devices_success', { name: getUserDisplayName(user) }), 'success');
              onClose();
            } 
          },
        );
      }}
      title={t('reset_devices_title')}
      description={t('reset_devices_desc', { name: user ? getUserDisplayName(user) : 'this user' })}
      confirmLabel={t('reset_devices_btn')}
      confirmColor="error"
      isLoading={mutation.isPending}
      error={mutation.error ? parseRpcError(mutation.error).message : null}
      icon={<DevicesOther sx={{ fontSize: 22 }} />}
    />
  );
}

// ── Delete Dialog ────────────────────────────────────────────────
export function DeleteUserDialog({
  user,
  open,
  onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('users');
  const { showToast } = useToastStore();
  const mutation = useDeleteUser();

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => {
        if (!user) return;
        mutation.mutate(user.id, {
          onSuccess: () => {
            showToast(t('delete_user_success', { name: getUserDisplayName(user) }), 'success');
            onClose();
          },
        });
      }}
      title={t('delete_user_title', { name: user ? getUserDisplayName(user) : 'User' })}
      description={t('delete_user_desc')}
      confirmLabel={t('delete_user_btn')}
      confirmColor="error"
      isLoading={mutation.isPending}
      error={mutation.error ? parseRpcError(mutation.error).message : null}
      icon={<DeleteForever sx={{ fontSize: 22 }} />}
    />
  );
}
