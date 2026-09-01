import type { Meta, StoryObj } from '@storybook/react';
import { ConfirmDialog } from './ConfirmDialog';
import { Warning, Lock, Block } from '@mui/icons-material';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';
import { within, userEvent, expect } from '@storybook/test';

const meta = {
  title: 'Features/Users/ConfirmDialog',
  component: ConfirmDialog,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<any>;

const DialogDemo = (args: React.ComponentProps<typeof ConfirmDialog>) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Action Dialog</Button>
      <ConfirmDialog
        {...args}
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      >
        <p className="text-sm text-muted-foreground">
          Please provide a reason for this administrative action.
        </p>
        <textarea
          aria-label="Action Reason"
          className="w-full mt-2 p-2 rounded-xl border border-border bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="E.g., violated terms of service"
          rows={3}
        />
      </ConfirmDialog>
    </>
  );
};

export const SuspendUser: Story = {
  render: (args: any) => <DialogDemo {...args} />,
  args: {
    title: 'Suspend User',
    description: 'This user will be temporarily blocked from accessing the platform.',
    confirmLabel: 'Suspend',
    confirmColor: 'warning',
    icon: <Warning />,
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Open Dialog', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /Open Action Dialog/i }));
    });

    // The modal mounts outside root by default unless disablePortal is false or we use screen,
    // but within(document.body) is often better for MUI modals if portalled. Drawer and Modal we built are
    // portalled, but for storybook canvas target let's assume body.
    const body = within(document.body);

    await step('Verify Dialog Contents', async () => {
      const heading = await body.findByRole('heading', { name: /Suspend User/i });
      expect(heading).toBeInTheDocument();
    });

    await step('Fill out Reason', async () => {
      const textArea = body.getByLabelText(/Action Reason/i);
      await userEvent.type(textArea, 'Systematic policy violation');
      expect(textArea).toHaveValue('Systematic policy violation');
    });

    await step('Confirm Action', async () => {
      const submitBtn = body.getByRole('button', { name: /Suspend/i });
      await userEvent.click(submitBtn);
    });
  },
};

export const BanUser: Story = {
  render: (args: any) => <DialogDemo {...args} />,
  args: {
    title: 'Ban User',
    description: 'This is a permanent destructive action.',
    confirmLabel: 'Ban Permanently',
    confirmColor: 'error',
    icon: <Block />,
  },
};

export const LockUser: Story = {
  render: (args: any) => <DialogDemo {...args} />,
  args: {
    title: 'Lock Account',
    description: 'Account will be locked until manual review.',
    confirmLabel: 'Lock',
    confirmColor: 'warning',
    icon: <Lock />,
  },
};
