import type { Meta, StoryObj } from '@storybook/react';
import { AppLockControl } from './AppLockControl';
import { http, HttpResponse } from 'msw';

const meta: Meta<typeof AppLockControl> = {
  title: 'Settings/AppLockControl',
  component: AppLockControl,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AppLockControl>;

export const Unlocked: Story = {
  args: {
    settings: {
      maintenance: [
        { key: 'app_locked', value: 'false' },
        { key: 'app_lock_message', value: '' },
      ],
    } as any,
  },
  parameters: {
    msw: {
      handlers: [
        http.post('*/rpc/lock_app', () => {
          return HttpResponse.json({ data: true, error: null });
        }),
      ],
    },
  },
};

export const Locked: Story = {
  args: {
    settings: {
      maintenance: [
        { key: 'app_locked', value: 'true' },
        { key: 'app_lock_message', value: 'System is under planned maintenance.' },
      ],
    } as any,
  },
  parameters: {
    msw: {
      handlers: [
        http.post('*/rpc/unlock_app', () => {
          return HttpResponse.json({ data: true, error: null });
        }),
      ],
    },
  },
};

export const Loading: Story = {
  args: {
    settings: {
      maintenance: [
        { key: 'app_locked', value: 'false' },
      ],
    } as any,
  },
  parameters: {
    msw: {
      handlers: [
        http.post('*/rpc/lock_app', () => {
          return new Promise(() => {});
        }),
      ],
    },
  },
};
