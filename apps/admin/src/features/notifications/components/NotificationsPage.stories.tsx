import type { Meta, StoryObj } from '@storybook/react';
import NotificationsPage from './NotificationsPage';
import { http, HttpResponse, delay } from 'msw';

const meta: Meta<typeof NotificationsPage> = {
  title: 'Features/Notifications/NotificationsPage',
  component: NotificationsPage,
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        // getNotifications
        http.get('*/rest/v1/notifications*', async ({ request }) => {
          await delay(800);
          return HttpResponse.json(
            [
              {
                id: '1',
                title: 'Welcome to Eduzone',
                body: 'We are glad to have you here. This is a system-wide announcement for all students and teachers.',
                target_audience: 'all',
                target_permission: null,
                target_user_ids: null,
                created_at: new Date().toISOString(),
              },
              {
                id: '2',
                title: 'New Course Available',
                body: 'Advanced Mathematics is now open for enrollment.',
                target_audience: 'students',
                target_permission: null,
                target_user_ids: null,
                created_at: new Date(Date.now() - 3600000).toISOString(),
              },
              {
                id: '3',
                title: 'Server Maintenance',
                body: 'The server will be down for maintenance at 2 AM UTC.',
                target_audience: 'admins',
                target_permission: 'settings.manage',
                target_user_ids: null,
                created_at: new Date(Date.now() - 7200000).toISOString(),
              },
            ],
            {
              headers: { 'Content-Range': '0-2/3', 'x-content-range': '0-2/3' },
            },
          );
        }),
        // send_notification RPC
        http.post('*/rest/v1/rpc/send_notification', async () => {
          await delay(1000);
          return HttpResponse.json('new-notif-id');
        }),
        // delete_notification RPC
        http.post('*/rest/v1/rpc/delete_notification', async () => {
          await delay(1000);
          return HttpResponse.json(null);
        }),
        // getAllPermissions
        http.get('*/rest/v1/permissions*', () => {
          return HttpResponse.json([
            { name: 'users.manage' },
            { name: 'courses.manage' },
            { name: 'settings.manage' },
            { name: 'notifications.send' },
          ]);
        }),
        // searchUsers
        http.get('*/rest/v1/users*', () => {
          return HttpResponse.json([
            { id: 'u1', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
            { id: 'u2', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com' },
          ]);
        }),
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof NotificationsPage>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('*/rest/v1/notifications*', async () => {
          await delay('infinite');
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('*/rest/v1/notifications*', () => {
          return HttpResponse.json([], { headers: { 'Content-Range': '*/0' } });
        }),
      ],
    },
  },
};
