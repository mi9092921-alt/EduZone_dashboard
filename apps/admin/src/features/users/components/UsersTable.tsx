'use client';

import Image from 'next/image';
import { useState, memo, useMemo, useCallback } from 'react';
import { ContentCopy, MoreHoriz } from '@mui/icons-material';
import { Tooltip } from '@mui/material';
import type { User, AccountAction } from '@/domain/types/user.types';
import { getUserDisplayName, getUserInitials } from '@/domain/types/user.types';
import { UserRowActions } from './UserRowActions';
import { formatDistanceToNow } from './_utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { TablePagination } from '@/components/ui/TablePagination';
import { useTranslations, useLocale } from 'next-intl';

// ── Status config ────────────────────────────────────────────────
const STATUS_CONFIG = {
  active: { color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20', dot: 'bg-emerald-500 dark:bg-emerald-400' },
  locked: { color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10 border-orange-100 dark:border-orange-500/20', dot: 'bg-orange-500 dark:bg-orange-400' },
  suspended: { color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20', dot: 'bg-amber-500 dark:bg-amber-400' },
  banned: { color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20', dot: 'bg-red-500 dark:bg-red-400' },
} as const;

// ── Role config ──────────────────────────────────────────────────
const ROLE_CONFIG = {
  super_admin: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/20',
  admin: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20',
  teacher: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
  student: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
} as const;

const CopyButton = memo(({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  const tAudit = useTranslations('audit');

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <Tooltip
      title={copied ? tAudit('copied_tooltip') : tAudit('copy_tooltip')}
      placement="top"
      arrow
      disableInteractive
    >
      <button
        onClick={handleCopy}
        className={cn(
          "p-1.5 rounded-md transition-faang active:scale-95 opacity-0 group-hover/contact:opacity-100",
          copied
            ? "text-emerald-500 dark:text-emerald-400"
            : "text-muted-foreground hover:text-primary"
        )}
      >
        <ContentCopy fontSize="inherit" className="text-xs transition-opacity" />
      </button>
    </Tooltip>
  );
});
CopyButton.displayName = 'CopyButton';

// ── User Row Component ──────────────────────────────────────────
interface UserRowProps {
  user: User;
  isSelected: boolean;
  onSelectToggle: (id: string) => void;
  onViewProfile: (user: User) => void;
  onAction: (user: User, action: AccountAction) => void;
  onDeleteUser: (user: User) => void;
  onTerminateSessions: (user: User) => void;
  onResetDevices: (user: User) => void;
  onIssueWarning: (user: User) => void;
  locale: string;
}

const UserRow = memo(({
  user,
  isSelected,
  onSelectToggle,
  onViewProfile,
  onAction,
  onDeleteUser,
  onTerminateSessions,
  onResetDevices,
  onIssueWarning,
  locale,
}: UserRowProps) => {
  const t = useTranslations('users');
  const statusConfig = STATUS_CONFIG[user.account_status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.active;
  const roleClass = ROLE_CONFIG[user.primary_role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.student;
  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);

  return (
    <tr
      onClick={() => onViewProfile(user)}
      className="group hover:bg-muted/30 transition-all duration-200 cursor-pointer"
    >
      <td className="px-5 py-4 sticky left-0 bg-card group-hover:bg-muted/30 z-10 border-b border-border/40" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary transition-faang cursor-pointer"
          checked={isSelected}
          onChange={() => onSelectToggle(user.id)}
        />
      </td>
      <td className="px-4 py-4 border-b border-border/40">
        <div className="flex items-center gap-3">
          {user.avatar_url ? (
            <Image src={user.avatar_url} alt={displayName} width={36} height={36} sizes="36px" className="h-9 w-9 rounded-full object-cover border border-border/50" unoptimized />
          ) : (
            <div className="h-9 w-9 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-[11px] font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200/20">
              {initials}
            </div>
          )}
          <span className="text-sm font-bold text-foreground truncate max-w-[260px] capitalize">{displayName}</span>
        </div>
      </td>
      <td className="px-4 py-4 text-start border-b border-border/40">
        <div className="flex flex-col gap-0.5 w-fit">
          <div className="flex items-center gap-1 group/contact w-fit">
            <span className="text-sm text-foreground/80 font-medium truncate max-w-[280px]">{user.email || '—'}</span>
            {user.email && <CopyButton value={user.email} />}
          </div>
          {user.phone && (
            <div className="flex items-center gap-1 group/contact w-fit">
              <span className="text-xs text-muted-foreground">{user.phone}</span>
              <CopyButton value={user.phone} />
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4 border-b border-border/40">
        <span className={cn("px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase tracking-tight", roleClass)}>
          {t(`role_${user.primary_role}` as any)}
        </span>
      </td>
      <td className="px-4 py-4 border-b border-border/40">
        <div className={cn("inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-tight border transition-faang", statusConfig.bg, statusConfig.color)}>
          <div className={cn("h-1.5 w-1.5 rounded-full", statusConfig.dot)} />
          {t(`status_${user.account_status}` as any)}
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-muted-foreground whitespace-nowrap border-b border-border/40">
        {user.last_login ? formatDistanceToNow(user.last_login, locale) : t('temp_password_placeholder')}
      </td>
      <td className="px-5 py-4 text-end sticky right-0 bg-card group-hover:bg-muted/30 z-10 border-b border-border/40 shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.05)] overflow-visible" onClick={(e) => e.stopPropagation()}>
        <UserRowActions
          user={user}
          onViewProfile={onViewProfile}
          onAction={onAction}
          onDeleteUser={onDeleteUser}
          onTerminateSessions={onTerminateSessions}
          onResetDevices={onResetDevices}
          onIssueWarning={onIssueWarning}
        />
      </td>
    </tr>
  );
});
UserRow.displayName = 'UserRow';

interface UsersTableProps {
  users: User[];
  isLoading: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  selectedIds: Set<string>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelectToggle: (id: string) => void;
  onSelectAll: (checked: boolean) => void;
  onViewProfile: (user: User) => void;
  onAction: (user: User, action: AccountAction) => void;
  onDeleteUser: (user: User) => void;
  onTerminateSessions: (user: User) => void;
  onResetDevices: (user: User) => void;
  onIssueWarning: (user: User) => void;
}

export function UsersTable({
  users,
  isLoading,
  page,
  pageSize,
  totalCount,
  selectedIds,
  onPageChange,
  onPageSizeChange,
  onSelectToggle,
  onSelectAll,
  onViewProfile,
  onAction,
  onDeleteUser,
  onTerminateSessions,
  onResetDevices,
  onIssueWarning,
}: UsersTableProps) {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const allSelected = useMemo(() =>
    users.length > 0 && users.every((u) => selectedIds.has(u.id)),
    [users, selectedIds]
  );

  const totalPages = useMemo(() =>
    Math.ceil(totalCount / pageSize),
    [totalCount, pageSize]
  );

  const skeletonRows = useMemo(() =>
    Array.from({ length: pageSize }, (_, i) => i),
    [pageSize]
  );

  return (
    <div className="w-full overflow-hidden rounded-lg border border-border/50 bg-card shadow-sm">
      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            <tr className="border-b border-border/40 transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
              <th className="h-12 px-5 text-start align-middle font-medium text-muted-foreground w-[1%] sticky left-0 bg-background z-20 border-b border-border/40">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary transition-faang cursor-pointer"
                  checked={allSelected}
                  onChange={(e) => onSelectAll(e.target.checked)}
                />
              </th>
              <th className="h-12 px-4 text-start align-middle font-medium text-muted-foreground w-[25%] border-b border-border/40">
                {t('table_header_user')}
              </th>
              <th className="h-12 px-4 text-start align-middle font-medium text-muted-foreground w-[25%] border-b border-border/40">
                {t('table_header_contact')}
              </th>
              <th className="h-12 px-4 text-start align-middle font-medium text-muted-foreground w-[10%] border-b border-border/40">
                {t('table_header_role')}
              </th>
              <th className="h-12 px-4 text-start align-middle font-medium text-muted-foreground w-[10%] border-b border-border/40">
                {t('table_header_status')}
              </th>
              <th className="h-12 px-4 text-start align-middle font-medium text-muted-foreground w-[15%] border-b border-border/40">
                {t('table_header_last_login')}
              </th>
              <th className="h-12 px-5 text-end align-middle font-medium text-muted-foreground w-[1%] sticky right-0 bg-background z-20 border-b border-border/40 shadow-[-8px_0_12px_-6px_rgba(0,0,0,0.05)]">
                <MoreHoriz className="text-muted-foreground" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading ? (
              skeletonRows.map((i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-5 py-4"><div className="h-4 w-4 bg-muted rounded" /></td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 bg-muted rounded-full" />
                      <div className="h-4 w-32 bg-muted rounded" />
                    </div>
                  </td>
                  <td className="px-4 py-4"><div className="h-4 w-48 bg-muted rounded" /></td>
                  <td className="px-4 py-4"><div className="h-6 w-20 bg-muted rounded-full" /></td>
                  <td className="px-4 py-4"><div className="h-4 w-16 bg-muted rounded" /></td>
                  <td className="px-4 py-4 text-end"><div className="h-4 w-24 bg-muted rounded" /></td>
                  <td className="px-5 py-4 text-end"><div className="h-8 w-8 bg-muted rounded-full ms-auto" /></td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm font-medium">
                  {t('no_users_found')}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelected={selectedIds.has(user.id)}
                  onSelectToggle={onSelectToggle}
                  onViewProfile={onViewProfile}
                  onAction={onAction}
                  onDeleteUser={onDeleteUser}
                  onTerminateSessions={onTerminateSessions}
                  onResetDevices={onResetDevices}
                  onIssueWarning={onIssueWarning}
                  locale={locale}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <TablePagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
