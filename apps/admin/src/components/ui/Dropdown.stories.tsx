import type { Meta, StoryObj } from '@storybook/react';
import { Dropdown, DropdownItem, DropdownSeparator } from './Dropdown';
import { Button } from './Button';
import { Save, Delete, CopyAll } from '@mui/icons-material';

const meta = {
  title: 'UI Generic/Dropdown',
  component: Dropdown,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button variant="outline">Open Menu</Button>,
    children: (
      <>
        <DropdownItem icon={<Save fontSize="small" />}>Save Changes</DropdownItem>
        <DropdownItem icon={<CopyAll fontSize="small" />}>Duplicate</DropdownItem>
        <DropdownSeparator />
        <DropdownItem variant="destructive" icon={<Delete fontSize="small" />}>
          Delete Permanently
        </DropdownItem>
      </>
    ),
  },
};

export const WithoutIcons: Story = {
  args: {
    trigger: <Button>Actions</Button>,
    align: 'start',
    children: (
      <>
        <DropdownItem>Profile</DropdownItem>
        <DropdownItem>Settings</DropdownItem>
        <DropdownItem>Logout</DropdownItem>
      </>
    ),
  },
};
