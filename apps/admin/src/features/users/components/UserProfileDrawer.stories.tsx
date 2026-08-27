import type { Meta, StoryObj } from '@storybook/react';
import { UserProfileDrawer } from './UserProfileDrawer';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';
import { within, userEvent, expect } from '@storybook/test';
import { userFactory } from '../../../../tests/factories/user.factory';
import { http, HttpResponse } from 'msw';

const activeUser = userFactory.build({ 
  first_name: 'John', 
  last_name: 'Doe',
  email: 'john.doe@eduzone.app',
  phone: '+1 234 567 8900'
});

const suspendedUser = userFactory.suspended(48, { 
  first_name: 'Jane', 
  last_name: 'Smith' 
});

const meta = {
  title: 'Features/Users/UserProfileDrawer',
  component: UserProfileDrawer,
  parameters: {
    layout: 'centered',
    msw: {
      handlers: [
        http.get('*/rest/v1/user_devices*', () => {
          return HttpResponse.json([
            { id: '1', device_name: 'iPhone 13', platform: 'ios', last_seen: new Date().toISOString(), trust_score: 98 },
            { id: '2', device_name: 'MacBook Pro', platform: 'macos', last_seen: new Date(Date.now() - 86400000).toISOString(), trust_score: 85 }
          ]);
        }),
        http.get('*/rest/v1/user_sessions*', () => {
          return HttpResponse.json([
            { id: '1', ip_address: '192.168.1.1', risk_score: 'low', started_at: new Date().toISOString() }
          ]);
        }),
        http.get('*/rest/v1/user_roles*', () => {
          return HttpResponse.json([
            { user_id: activeUser.id, role_id: '1', role_name: 'super_admin', role_label: 'Super Admin', granted_at: new Date().toISOString() }
          ]);
        }),
        http.get('*/rest/v1/role_permissions*', () => {
          return HttpResponse.json([]);
        })
      ]
    }
  },
} satisfies Meta<typeof UserProfileDrawer>;

export default meta;
type Story = StoryObj<any>;

const DrawerDemo = (args: React.ComponentProps<typeof UserProfileDrawer>) => {
  const [open, setOpen] = useState(true);
  
  return (
    <div className="min-h-[500px]">
      {!open && <Button onClick={() => setOpen(true)}>Open Profile</Button>}
      <UserProfileDrawer 
        {...args} 
        open={open} 
        onClose={() => setOpen(false)} 
        onTerminateSessions={() => {}} 
        onResetDevices={() => {}} 
      />
    </div>
  );
};

export const ActiveUser: Story = {
  render: (args: any) => <DrawerDemo {...args} />,
  args: {
    user: activeUser,
  },
  play: async ({ canvasElement, step }) => {
    // Note: The drawer renders portalled or overlay. We use document.body for reliable querying.
    const body = within(document.body);
    
    await step('Verify Overview renders', async () => {
      expect(await body.findByText(/John Doe/i)).toBeInTheDocument();
      expect(body.getByText(/john.doe@eduzone.app/i)).toBeInTheDocument();
      expect(body.getByText(/\+1 234 567 8900/i)).toBeInTheDocument();
    });

    await step('Navigate to Security Tab', async () => {
      const securityTab = await body.findByRole('button', { name: /Security/i });
      await userEvent.click(securityTab);
      // MSW will intercept and return the devices
      expect(await body.findByText(/iPhone 13/i)).toBeInTheDocument();
      expect(await body.findByText(/MacBook/i)).toBeInTheDocument();
    });

    await step('Navigate to Access Tab', async () => {
      const accessTab = body.getByRole('button', { name: /Access/i });
      await userEvent.click(accessTab);
      // Roles loaded via MSW
      expect(await body.findByText(/Super Admin/i)).toBeInTheDocument();
    });
  }
};

export const SuspendedUser: Story = {
  render: (args: any) => <DrawerDemo {...args} />,
  args: {
    user: suspendedUser,
  },
  play: async ({ step }) => {
    const body = within(document.body);
    await step('Verify Suspended Notice', async () => {
      expect(await body.findByText(/Notice/i)).toBeInTheDocument();
      expect(body.getByText(/Policy violation/i)).toBeInTheDocument();
    });
  }
};
