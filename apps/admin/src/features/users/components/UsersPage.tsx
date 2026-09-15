'use client';

import { Add } from '@mui/icons-material';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

import {
  LockUserDialog,
  SuspendUserDialog,
  BanUserDialog,
  IssueWarningDialog,
  TerminateSessionsDialog,
  ResetDevicesDialog,
  DeleteUserDialog,
} from './ActionDialogs';
import { AddUserDialog } from './AddUserDialog';
import { BulkActionBar } from './BulkActionBar';
import { BulkProgressPanel } from './BulkProgressPanel';
import { UserFiltersBar } from './UserFiltersBar';
import { UserProfileDrawer } from './UserProfileDrawer';
import { UsersTable } from './UsersTable';
import { UserStatsCards } from './UserStatsCards';

import { useMutateUserAccount } from '@/adapters/mutations/users.mutations';
import { useUsers, useUserById } from '@/adapters/queries/users.queries';
import { Button } from '@/components/ui/Button';
import type { BulkAction } from '@/domain/types/bulk.types';
import { getUserDisplayName, type User, type UserFilters, type AccountAction } from '@/domain/types/user.types';
import { usePathname, useRouter } from '@/i18n/routing';
import { downloadCsv } from '@/lib/utils';

type DialogType =
  | 'lock'
  | 'suspend'
  | 'ban'
  | 'warning'
  | 'terminateSessions'
  | 'resetDevices'
  | 'delete'
  | null;

export function UsersPage() {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const drawerUserId = searchParams.get('user');

  const [filters, setFilters] = useState<UserFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Holds the User object from the row that was clicked, so opening the
  // drawer is instant (no fetch/flash). Cleared whenever it no longer
  // matches the URL (e.g. after a refresh, where the app remounts with
  // ?user=<id> already in the address bar but no click ever happened).
  const [clickedUser, setClickedUser] = useState<User | null>(null);
  const { data: fetchedDrawerUser } = useUserById(
    drawerUserId && clickedUser?.id !== drawerUserId ? drawerUserId : null,
  );
  const drawerUser = clickedUser?.id === drawerUserId ? clickedUser : (fetchedDrawerUser ?? null);
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [dialogUser, setDialogUser] = useState<User | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const isAddUserOpen =
    searchParams.get('dialog') === 'add-user' ||
    searchParams.get('dialog') === 'create-user' ||
    searchParams.get('dialog') === 'create' ||
    addUserOpen;

  const handleOpenAddUser = useCallback(() => {
    setAddUserOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set('dialog', 'add-user');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const handleCloseAddUser = useCallback(() => {
    setAddUserOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('dialog');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  const [bulkJobId, setBulkJobId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);

  // ── Query ────────────────────────────────────────────────────
  const { data, isLoading, isFetching, isError, refetch } = useUsers(filters, page, pageSize);
  const users = data?.data ?? [];
  const totalCount = data?.count ?? 0;

  // ── Unlock mutation (no dialog needed) ───────────────────────
  const unlock = useMutateUserAccount();

  // ── Handlers ─────────────────────────────────────────────────
  const handleViewProfile = useCallback(
    (user: User) => {
      setClickedUser(user);
      const params = new URLSearchParams(searchParams.toString());
      params.set('user', user.id);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const handleCloseDrawer = useCallback(() => {
    setClickedUser(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('user');
    params.delete('tab');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  const handleAction = useCallback(
    (user: User, action: AccountAction) => {
      if (action === 'unlock') {
        unlock.mutate({ userId: user.id, action: 'unlock' });
        return;
      }
      setDialogUser(user);
      setDialogType(action as DialogType);
    },
    [unlock],
  );

  const handleDeleteUser = useCallback((user: User) => {
    setDialogUser(user);
    setDialogType('delete');
  }, []);

  const handleTerminateSessions = useCallback((user: User) => {
    setDialogUser(user);
    setDialogType('terminateSessions');
  }, []);

  const handleResetDevices = useCallback((user: User) => {
    setDialogUser(user);
    setDialogType('resetDevices');
  }, []);

  const handleIssueWarning = useCallback((user: User) => {
    setDialogUser(user);
    setDialogType('warning');
  }, []);

  const handleSelectToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(users.map((u) => u.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [users],
  );

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleFiltersChange = useCallback((newFilters: UserFilters) => {
    setFilters(newFilters);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleExport = useCallback(() => {
    if (users.length === 0) return;
    downloadCsv(
      users.map((user) => ({
        id: user.id,
        name: getUserDisplayName(user),
        email: user.email ?? '',
        phone: user.phone ?? '',
        role: user.primary_role,
        status: user.account_status,
        last_login: user.last_login ?? '',
      })),
      `users-page-${new Date().toISOString().split('T')[0]}`,
    );
  }, [users]);

  const closeDialog = useCallback(() => {
    setDialogType(null);
  }, []);

  const handleBulkJobDone = useCallback(() => {
    setBulkJobId(null);
    setBulkAction(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-title">{tCommon('users')}</h1>
          <div className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold uppercase tracking-wider border border-border">
            {totalCount.toLocaleString()} {tCommon('total')}
          </div>
          {isFetching && !isLoading && (
            <div className="flex items-center gap-1.5 animate-pulse text-primary text-xs font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              {tCommon('updating')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleOpenAddUser} className="gap-2">
            <Add className="text-sm scale-90" />
            {t('create_user_btn')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <UserStatsCards />

      {/* Filters */}
      <UserFiltersBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        totalCount={totalCount}
        onExport={handleExport}
      />

      {isError && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <div>
            <p className="font-semibold">{tErrors('title')}</p>
            <p className="mt-1 opacity-80">{tErrors('desc')}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            {tErrors('retry')}
          </Button>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && !bulkJobId && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          selectedIds={Array.from(selectedIds)}
          filters={filters}
          onClear={() => setSelectedIds(new Set())}
          onJobStarted={(jobId, action) => {
            setBulkJobId(jobId);
            setBulkAction(action);
            setSelectedIds(new Set());
          }}
        />
      )}
      {bulkJobId && bulkAction && (
        <BulkProgressPanel jobId={bulkJobId} action={bulkAction} onDone={handleBulkJobDone} />
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <UsersTable
          users={users}
          isLoading={isLoading}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          selectedIds={selectedIds}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onSelectToggle={handleSelectToggle}
          onSelectAll={handleSelectAll}
          onViewProfile={handleViewProfile}
          onAction={handleAction}
          onDeleteUser={handleDeleteUser}
          onTerminateSessions={handleTerminateSessions}
          onResetDevices={handleResetDevices}
          onIssueWarning={handleIssueWarning}
        />
      </div>

      {/* Profile Drawer */}
      <UserProfileDrawer
        user={drawerUser}
        open={!!drawerUserId}
        onClose={handleCloseDrawer}
        onTerminateSessions={handleTerminateSessions}
        onResetDevices={handleResetDevices}
      />

      {/* Action Dialogs */}
      <LockUserDialog user={dialogUser} open={dialogType === 'lock'} onClose={closeDialog} />
      <SuspendUserDialog user={dialogUser} open={dialogType === 'suspend'} onClose={closeDialog} />
      <BanUserDialog user={dialogUser} open={dialogType === 'ban'} onClose={closeDialog} />
      <IssueWarningDialog user={dialogUser} open={dialogType === 'warning'} onClose={closeDialog} />
      <TerminateSessionsDialog
        user={dialogUser}
        open={dialogType === 'terminateSessions'}
        onClose={closeDialog}
      />
      <ResetDevicesDialog
        user={dialogUser}
        open={dialogType === 'resetDevices'}
        onClose={closeDialog}
      />
      <DeleteUserDialog user={dialogUser} open={dialogType === 'delete'} onClose={closeDialog} />

      {/* Add User Dialog */}
      <AddUserDialog open={isAddUserOpen} onClose={handleCloseAddUser} />
    </div>
  );
}
