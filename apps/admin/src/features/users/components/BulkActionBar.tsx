'use client';

import {
  Lock,
  LockOpen,
  Block,
  Warning,
  ExitToApp,
  DevicesOther,
  FileDownload,
  Close,
  DeleteForever,
} from '@mui/icons-material';
import { Tooltip } from '@mui/material';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';

import { useSubmitBulkAction } from '@/adapters/mutations/bulk.mutations';
import { useToastStore } from '@/adapters/stores/toast.store';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import type { BulkAction } from '@/domain/types/bulk.types';
import type { UserFilters } from '@/domain/types/user.types';
import { cn } from '@/lib/utils';



interface BulkActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  filters: UserFilters;
  onClear: () => void;
  onJobStarted: (jobId: string, action: BulkAction) => void;
}

const ACTIONS: {
  id: BulkAction;
  labelKey: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}[] = [
    { id: 'lock' as const, labelKey: 'bulk_action_lock', icon: Lock, color: 'text-orange-600 dark:text-orange-400', bgColor: 'hover:bg-orange-50 dark:hover:bg-orange-500/10' },
    { id: 'unlock' as const, labelKey: 'bulk_action_unlock', icon: LockOpen, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10' },
    { id: 'suspend' as const, labelKey: 'bulk_action_suspend', icon: Block, color: 'text-amber-600 dark:text-amber-400', bgColor: 'hover:bg-amber-50 dark:hover:bg-amber-500/10' },
    { id: 'ban' as const, labelKey: 'bulk_action_ban', icon: Block, color: 'text-red-600 dark:text-red-400', bgColor: 'hover:bg-red-50 dark:hover:bg-red-500/10' },
    { id: 'warn' as const, labelKey: 'bulk_action_warn', icon: Warning, color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'hover:bg-yellow-50 dark:hover:bg-yellow-500/10' },
    { id: 'terminate_sessions' as const, labelKey: 'bulk_action_terminate_sessions', icon: ExitToApp, color: 'text-purple-600 dark:text-purple-400', bgColor: 'hover:bg-purple-50 dark:hover:bg-purple-500/10' },
    { id: 'reset_devices' as const, labelKey: 'bulk_action_reset_devices', icon: DevicesOther, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'hover:bg-indigo-50 dark:hover:bg-indigo-500/10' },
    { id: 'export' as const, labelKey: 'bulk_action_export', icon: FileDownload, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10' },
    { id: 'delete' as const, labelKey: 'bulk_action_delete', icon: DeleteForever, color: 'text-red-600 dark:text-red-400', bgColor: 'hover:bg-red-50 dark:hover:bg-red-500/10' },

  ];

export function BulkActionBar({
  selectedCount,
  selectedIds,
  filters,
  onClear,
  onJobStarted,
}: BulkActionBarProps) {
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [estimatedCount, setEstimatedCount] = useState<number>(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submitBulk = useSubmitBulkAction();
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const { showToast } = useToastStore();

  const handleActionClick = (action: BulkAction) => {
    setError(null);
    setPendingAction(action);
    setEstimatedCount(selectedCount);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!pendingAction) return;

    try {
      const params: Record<string, unknown> = {};
      if (reason) params.reason = reason;
      if (pendingAction === 'export') params.export_format = 'json';

      const result = await submitBulk.mutateAsync({
        action: pendingAction,
        filters,
        selectedIds,
        params,
      });

      showToast(t('bulk_job_started_success'), 'success');
      onJobStarted(result.job_id, pendingAction);
      setShowConfirm(false);
      setPendingAction(null);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setPendingAction(null);
    setReason('');
    setError(null);
  };

  return (
    <>
      {/* Action bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-2xl animate-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <div className="flex items-center justify-center h-7 min-w-7 px-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold">
            {selectedCount}
          </div>
          {t('selected')}
        </div>

        <div className="h-6 w-px bg-border mx-1" />

        <div className="flex items-center gap-1 flex-wrap flex-1">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            const label = t(action.labelKey as any);
            return (
              <Tooltip key={action.id} title={label}>
                <button
                  onClick={() => handleActionClick(action.id)}
                  disabled={dryRunning}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    action.color,
                    action.bgColor,
                    dryRunning && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <Icon className="text-sm" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              </Tooltip>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClear}
          aria-label={tCommon('clear')}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Close className="text-base" />
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive font-medium">
          {error}
        </div>
      )}

      {/* Confirmation dialog */}
      {pendingAction && (
        <ConfirmDialog
          open={showConfirm && !!pendingAction}
          onClose={handleCancel}
          onConfirm={handleConfirm}
          title={t(`bulk_confirm_title_${pendingAction}` as any)}
          description={t('bulk_confirm_desc', { count: estimatedCount })}
          confirmLabel={t(`bulk_confirm_btn_${pendingAction}` as any)}
          confirmColor={pendingAction === 'ban' || pendingAction === 'delete' ? 'error' : 'warning'}
          isLoading={submitBulk.isPending}
          error={error}
          icon={pendingAction ? ACTIONS.find(a => a.id === pendingAction)?.icon && 
            React.createElement(ACTIONS.find(a => a.id === pendingAction)!.icon as any, { sx: { fontSize: 22 } }) : null}
        >
          {pendingAction !== 'export' && pendingAction !== 'unlock' && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="bulk-reason" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ps-1">
                {t('bulk_reason_label')}
              </Label>
              <Input
                id="bulk-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('bulk_reason_placeholder')}
                autoComplete="off"
              />
            </div>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
