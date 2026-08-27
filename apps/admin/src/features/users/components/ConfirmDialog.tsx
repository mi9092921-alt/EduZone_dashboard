'use client';

import { type ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'error' | 'warning' | 'primary' | 'success';
  isLoading?: boolean;
  error?: string | null;
  icon?: ReactNode;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'primary',
  isLoading = false,
  error,
  icon,
  children,
}: ConfirmDialogProps) {
  const getConfirmVariant = () => {
    switch (confirmColor) {
      case 'error': return 'destructive';
      case 'warning': return 'outline'; // We don't have a warning variant in Button, using outline or default
      default: return 'primary';
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className="max-w-md"
    >
      <div className="space-y-6">
        {/* Optional Icon & Additional Title handling if modal doesn't do it enough */}
        {icon && (
          <div className="flex justify-center mb-2">
            <div className={cn(
              "p-3 rounded-2xl",
              confirmColor === 'error' ? "bg-red-50 text-red-500" :
              confirmColor === 'warning' ? "bg-amber-50 text-amber-500" :
              "bg-primary/10 text-primary"
            )}>
              {icon}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {children}

          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isLoading}
            className="font-bold uppercase tracking-wider text-[11px]"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={getConfirmVariant() as any}
            onClick={onConfirm}
            isLoading={isLoading}
            className={cn(
              "min-w-[120px] font-bold uppercase tracking-wider text-[11px]",
              confirmColor === 'warning' && "border-amber-500/50 text-amber-600 hover:bg-amber-50"
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
