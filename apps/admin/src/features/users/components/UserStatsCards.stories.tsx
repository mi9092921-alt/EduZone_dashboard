import type { Meta, StoryObj } from '@storybook/react';
import { UserStatsCards } from './UserStatsCards';
import { http, HttpResponse } from 'msw';

const meta: Meta<typeof UserStatsCards> = {
  title: 'Users/UserStatsCards',
  component: UserStatsCards,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof UserStatsCards>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('*/rpc/get_user_stats', () => {
          return HttpResponse.json({
            data: {
              total_users: 1250,
              active_users: 1100,
              locked_users: 50,
              suspended_users: 80,
              banned_users: 20,
            },
            error: null,
          });
        }),
      ],
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('*/rpc/get_user_stats', () => {
          return new Promise(() => {}); // Never resolves
        }),
      ],
    },
  },
};

export const ErrorState: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('*/rpc/get_user_stats', () => {
          return HttpResponse.json({
            data: null,
            error: { message: 'Failed to fetch stats' },
          });
        }),
      ],
    },
  },
};
