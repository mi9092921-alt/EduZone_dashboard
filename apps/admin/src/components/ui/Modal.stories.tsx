import type { Meta, StoryObj } from '@storybook/react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useState } from 'react';

const meta = {
  title: 'UI Generic/Modal',
  component: Modal,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    maxWidth: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<any>;

const ModalDemo = (args: React.ComponentProps<typeof Modal>) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Open Modal</Button>
      <Modal {...args} open={open} onClose={() => setOpen(false)}>
        <p className="text-muted-foreground text-sm">
          Modal body content goes here. The overarching width is controlled by `maxWidth` prop, 
          which snaps to Tailwind container breaks. And there is a fancy glassmorphism backdrop.
        </p>
      </Modal>
    </div>
  );
};

export const Default: Story = {
  render: (args: any) => <ModalDemo {...args} />,
  args: {
    title: 'Confirm Deletion',
    description: 'Are you absolutely sure you want to do this?',
    maxWidth: 'sm',
    footer: (
      <>
        <Button variant="outline">Cancel</Button>
        <Button variant="destructive">Delete Everything</Button>
      </>
    ),
  },
};

export const FullScreen: Story = {
  render: (args: any) => <ModalDemo {...args} />,
  args: {
    title: 'Immersive Editing Mode',
    description: 'This modal covers the entire screen, ignoring maxWidth constraints.',
    fullScreen: true,
  },
};
