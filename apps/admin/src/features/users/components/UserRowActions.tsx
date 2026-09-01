'use client';

import {
  MoreVert,
  Visibility,
  Lock,
  LockOpen,
  PauseCircle,
  Block,
  ExitToApp,
  DevicesOther,
  Warning,
  DeleteForever,
} from '@mui/icons-material';
import { useTranslations } from 'next-intl';

import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/Dropdown';
import type { User, AccountAction } from '@/domain/types/user.types';

interface UserRowActionsProps {
  user: User;
  onViewProfile: (user: User) => void;
  onAction: (user: User, action: AccountAction) => void;
  onDeleteUser: (user: User) => void;
  onTerminateSessions: (user: User) => void;
  onResetDevices: (user: User) => void;
  onIssueWarning: (user: User) => void;
}

export function UserRowActions({
  user,
  onViewProfile,
  onAction,
  onDeleteUser,
  onTerminateSessions,
  onResetDevices,
  onIssueWarning,
}: UserRowActionsProps) {
  const t = useTranslations('users');

  return (
    <Dropdown
      trigger={
        <button className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border/50 transition-all duration-200 active:scale-95">
          <MoreVert className="text-xl" />
        </button>
      }
      align="end"
      className="w-60"
    >
      <div className="px-3 py-2 border-b border-border/50 mb-1">
        <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
          {t('actions_user_options')}
        </p>
      </div>

      <DropdownItem
        onClick={() => onViewProfile(user)}
        icon={<Visibility className="text-indigo-500 text-sm" />}
      >
        {t('actions_view_profile')}
      </DropdownItem>

      <DropdownSeparator />

      {/* Account Control Section */}
      <div className="px-3 py-1.5">
        <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
          {t('actions_account_status')}
        </p>
      </div>

      {user.account_status === 'locked' ? (
        <DropdownItem
          onClick={() => onAction(user, 'unlock')}
          icon={<LockOpen className="text-emerald-500 text-sm" />}
        >
          {t('actions_unlock_account')}
        </DropdownItem>
      ) : (
        <DropdownItem
          onClick={() => onAction(user, 'lock')}
          icon={<Lock className="text-orange-500 text-sm" />}
        >
          {t('actions_lock_account')}
        </DropdownItem>
      )}

      {user.account_status !== 'suspended' && (
        <DropdownItem
          onClick={() => onAction(user, 'suspend')}
          icon={<PauseCircle className="text-amber-500 text-sm" />}
        >
          {t('actions_suspend_account')}
        </DropdownItem>
      )}

      {user.account_status !== 'banned' && (
        <DropdownItem
          onClick={() => onAction(user, 'ban')}
          icon={<Block className="text-red-500 text-sm" />}
          variant="destructive"
        >
          {t('actions_ban_account')}
        </DropdownItem>
      )}

      <DropdownItem
        onClick={() => onDeleteUser(user)}
        icon={<DeleteForever className="text-red-600 text-sm" />}
        variant="destructive"
      >
        {t('actions_delete_user')}
      </DropdownItem>

      <DropdownSeparator />

      {/* Security Actions Section */}
      <div className="px-3 py-1.5">
        <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
          {t('actions_security_devices')}
        </p>
      </div>

      <DropdownItem
        onClick={() => onTerminateSessions(user)}
        icon={<ExitToApp className="text-slate-500 text-sm" />}
      >
        {t('actions_terminate_sessions')}
      </DropdownItem>

      <DropdownItem
        onClick={() => onResetDevices(user)}
        icon={<DevicesOther className="text-slate-500 text-sm" />}
      >
        {t('actions_reset_devices')}
      </DropdownItem>

      <DropdownItem
        onClick={() => onIssueWarning(user)}
        icon={<Warning className="text-amber-500 text-sm" />}
      >
        {t('actions_issue_warning')}
      </DropdownItem>
    </Dropdown>
  );
}
