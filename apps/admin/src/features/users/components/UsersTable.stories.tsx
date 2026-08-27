import type { Meta, StoryObj } from '@storybook/react';
import { UsersTable } from './UsersTable';
import { fn } from '@storybook/test';
import type { User } from '@/domain/types/user.types';

const mockUsers: any[] = [
  {
    id: '1',
    email: 'john.doe@example.com',
    first_name: 'John',
    last_name: 'Doe',
    primary_role: 'admin',
    account_status: 'active',
    last_login: new Date(Date.now() - 3600000).toISOString(),
    created_at: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    email: 'jane.smith@example.com',
    first_name: 'Jane',
    last_name: 'Smith',
    primary_role: 'teacher',
    account_status: 'suspended',
    last_login: new Date(Date.now() - 86400000 * 2).toISOString(),
    created_at: '2023-02-15T10:30:00Z',
  },
  {
    id: '3',
    email: 'bob.wilson@example.com',
    first_name: 'Bob',
    last_name: 'Wilson',
    primary_role: 'student',
    account_status: 'locked',
    last_login: null,
    created_at: '2024-03-20T14:20:00Z',
  },
];

const meta: Meta<typeof UsersTable> = {
  title: 'Users/UsersTable',
  component: UsersTable,
  tags: ['autodocs'],
  args: {
    users: mockUsers as User[],
    isLoading: false,
    page: 1,
    pageSize: 10,
    totalCount: 3,
    selectedIds: new Set(),
    onPageChange: fn(),
    onPageSizeChange: fn(),
    onSelectToggle: fn(),
    onSelectAll: fn(),
    onViewProfile: fn(),
    onAction: fn(),
    onTerminateSessions: fn(),
    onResetDevices: fn(),
    onIssueWarning: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof UsersTable>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    users: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    users: [],
    totalCount: 0,
  },
};

export const SelectedRows: Story = {
  args: {
    selectedIds: new Set(['1', '3']),
  },
};
