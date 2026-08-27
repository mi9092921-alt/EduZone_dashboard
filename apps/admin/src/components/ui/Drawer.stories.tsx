import type { Meta, StoryObj } from '@storybook/react';
import { Drawer } from './Drawer';
import { Button } from './Button';
import { useState } from 'react';

const meta = {
  title: 'UI Generic/Drawer',
  component: Drawer,
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,
    },
  },
  tags: ['autodocs'],
  argTypes: {
    side: {
      control: 'radio',
      options: ['start', 'end'],
    },
    open: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<any>;

// A wrapper to handle the local state for demonstration
const DrawerDemo = (args: React.ComponentProps<typeof Drawer>) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Open Drawer</Button>
      <Drawer {...args} open={open} onClose={() => setOpen(false)}>
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            This is the drawer content. It slides in over the page content and locks scrolling
            on the body to prevent interactions outside the drawer.
          </p>
          <div className="h-40 bg-muted/50 rounded flex items-center justify-center border border-dashed border-border">
            Placeholder Content
          </div>
          <div className="h-40 bg-muted/50 rounded flex items-center justify-center border border-dashed border-border">
            Scrollable Content
          </div>
          <div className="h-40 bg-muted/50 rounded flex items-center justify-center border border-dashed border-border">
            Scrollable Content
          </div>
        </div>
      </Drawer>
    </div>
  );
};

export const Default: Story = {
  render: (args: any) => <DrawerDemo {...args} />,
  args: {
    title: 'Settings Drawer',
    description: 'Manage your preferences here.',
    side: 'end',
  },
};

export const LeftSided: Story = {
  render: (args: any) => <DrawerDemo {...args} />,
  args: {
    title: 'Navigation Menu',
    description: 'Main navigation links.',
    side: 'start',
  },
};
