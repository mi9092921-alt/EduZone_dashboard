import type { Meta, StoryObj } from '@storybook/react';
import { Label } from './Label';
import { Input } from './Input';

const meta = {
  title: 'UI Generic/Label',
  component: Label,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    htmlFor: 'email',
    children: 'Email Address',
  },
};

export const WithInput: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2 w-72">
      <Label {...args} />
      <Input id={args.htmlFor} placeholder="john@doe.com" />
    </div>
  ),
  args: {
    htmlFor: 'email2',
    children: 'Email Address',
  },
};
