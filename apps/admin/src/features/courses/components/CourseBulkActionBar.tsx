'use client';

import {
  Publish,
  Drafts,
  Archive,
  DeleteForever,
  FileDownload,
  Close,
} from '@mui/icons-material';
import { Tooltip, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export type CourseBulkAction = 'publish' | 'draft' | 'archive' | 'delete' | 'export_json' | 'export_csv';

interface CourseBulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  onAction: (action: CourseBulkAction) => void;
  isPending?: boolean;
}

export function CourseBulkActionBar({
  selectedCount,
  onClear,
  onAction,
  isPending = false
}: CourseBulkActionBarProps) {
  const t = useTranslations('common');
  const [confirmAction, setConfirmAction] = useState<CourseBulkAction | null>(null);
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null);

  const handleActionClick = (action: CourseBulkAction) => {
    if (action === 'delete' || action === 'archive') {
      setConfirmAction(action);
    } else {
      onAction(action);
    }
  };

  const handleConfirm = () => {
    if (confirmAction) {
      onAction(confirmAction);
      setConfirmAction(null);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-2xl animate-in slide-in-from-bottom-2 duration-300 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <div className="flex items-center justify-center h-7 min-w-7 px-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-lg shadow-primary/20">
            {selectedCount}
          </div>
          <span className="hidden sm:inline">{t('selected')}</span>
        </div>

        <div className="h-6 w-px bg-border/60 mx-1" />

        <div className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
          {/* Status Actions */}
          <Tooltip title={t('publish')}>
            <button
              onClick={() => handleActionClick('publish')}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all disabled:opacity-50"
            >
              <Publish className="text-sm" />
              <span className="hidden lg:inline">{t('publish')}</span>
            </button>
          </Tooltip>

          <Tooltip title={t('draft_status')}>
            <button
              onClick={() => handleActionClick('draft')}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-500/10 transition-all disabled:opacity-50"
            >
              <Drafts className="text-sm" />
              <span className="hidden lg:inline">{t('draft_status')}</span>
            </button>
          </Tooltip>

          <Tooltip title={t('archive')}>
            <button
              onClick={() => handleActionClick('archive')}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all disabled:opacity-50"
            >
              <Archive className="text-sm" />
              <span className="hidden lg:inline">{t('archive')}</span>
            </button>
          </Tooltip>

          <div className="h-6 w-px bg-border/40 mx-1" />

          {/* Export Menu */}
          <Tooltip title={t('export')}>
            <button
              onClick={(e) => setExportAnchorEl(e.currentTarget)}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all disabled:opacity-50"
            >
              <FileDownload className="text-sm" />
              <span className="hidden sm:inline">{t('export')}</span>
            </button>
          </Tooltip>
          <Menu
            anchorEl={exportAnchorEl}
            open={Boolean(exportAnchorEl)}
            onClose={() => setExportAnchorEl(null)}
            PaperProps={{
              className: "mt-1 shadow-xl border border-border/50 rounded-xl",
              sx: { minWidth: 160 }
            }}
          >
            <MenuItem onClick={() => { onAction('export_json'); setExportAnchorEl(null); }}>
              <ListItemIcon><FileDownload fontSize="small" className="text-orange-500" /></ListItemIcon>
              <ListItemText primary="JSON Export" primaryTypographyProps={{ className: "text-xs font-bold" }} />
            </MenuItem>
            <MenuItem onClick={() => { onAction('export_csv'); setExportAnchorEl(null); }}>
              <ListItemIcon><FileDownload fontSize="small" className="text-emerald-500" /></ListItemIcon>
              <ListItemText primary="CSV Export" primaryTypographyProps={{ className: "text-xs font-bold" }} />
            </MenuItem>
          </Menu>

          <div className="h-6 w-px bg-border/40 mx-1" />

          {/* Delete Action */}
          <Tooltip title={t('delete')}>
            <button
              onClick={() => handleActionClick('delete')}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all disabled:opacity-50"
            >
              <DeleteForever className="text-sm" />
              <span className="hidden sm:inline">{t('delete')}</span>
            </button>
          </Tooltip>
        </div>

        <button
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Close className="text-base" />
        </button>
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        title={t('confirm_action')}
        description={t('bulk_confirm_action_desc', { count: selectedCount })}
        confirmLabel={t('confirm')}
        confirmColor="error"
        isLoading={isPending}
      />
    </>
  );
}
