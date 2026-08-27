import type { Meta, StoryObj } from '@storybook/react';
import { BulkProgressPanel } from './BulkProgressPanel';

// We mock the bulk.mutations and bulk.service via decorators or manual MSW 
// Since BulkProgressPanel subscribes to real-time events, we shouldn't execute real hooks in pure UI.
// But we can supply standard props if we abstracted the subscription out.
// Wait, BulkProgressPanel internally calls `subscribeToBulkProgress`.
// We will mock it using storybook decorators or MSW if it uses a network.
// For the sake of the story, we can just test the UI component if we mock the modules, 
// OR we can create a pure presentation component. 
// Let's rely on MSW or module mocking if Vitest/Webpack allows, otherwise 
// we'll provide a wrapper demonstrating states.

import * as bulkService from '@/infrastructure/repos/bulk.service';

const meta = {
  title: 'Features/Users/BulkProgressPanel',
  component: BulkProgressPanel,
  parameters: {
    layout: 'centered',
    chromatic: { 
      pauseAnimationAtEnd: true, 
      disableSnapshot: false 
    },
  },
  decorators: [
    (Story) => {
      // Mock the interval so animations stop naturally for Chromatic if needed
      return (
        <div className="w-[450px]">
          <Story />
        </div>
      );
    }
  ]
} satisfies Meta<typeof BulkProgressPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// Workaround for module-level subscription inside Storybook:
// We create a custom wrapper that overrides the subscription globally OR
// we just let it render "pending" if it fails to connect to Supabase.
// To accurately represent the stories, we would need to mock Supabase realtime.

export const Pending: Story = {
  args: {
    jobId: 'job-123',
    action: 'suspend',
    onDone: () => {},
  },
};

export const Processing: Story = {
  args: {
    jobId: 'job-456',
    action: 'lock',
    onDone: () => {},
  },
  // We can't easily mock the realtime channel here without MSW ws or vitest vi.mock
  // but the component fails gracefully to 'pending'
};
