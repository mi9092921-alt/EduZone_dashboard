import type { Meta, StoryObj } from '@storybook/react';
import { ChainVerifier } from './ChainVerifier';
import { http, HttpResponse } from 'msw';
import { within, userEvent, expect } from '@storybook/test';

// Mock the hash verification algorithm for the story since it relies on subtle crypto
// Actually, verifyHashChain runs real crypto logic if logs are provided.
// We can just construct a valid chain using mock data to test Intact, and an invalid one for Tampered.

import { createHash } from 'crypto';

// A mock function to generate a valid hash for testing
function generateTestHash(prevHash: string, payload: any, secret: string) {
  // We can't easily mock the exact Node crypto in browser seamlessly unless we pass valid string hashes.
  // The component imports `@/lib/hash-chain` which uses `hmac()`.
  // If the test has invalid hashes, it will fail naturally.
  // We'll provide arbitrary hashes. The real `verifyHashChain` will fail them
  // which will trigger the "Tampered" state naturally.
  // To simulate "Verified", we MIGHT need to mock `@/lib/hash-chain` but we can't easily do it in standard `.stories.tsx` without Webpack.
  // Instead, if we just want UI tests, we can test the error state, or we can mock the module if possible.
}

const meta: Meta<typeof ChainVerifier> = {
  title: 'Features/Audit/ChainVerifier',
  component: ChainVerifier,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ChainVerifier>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('*/rpc/get_audit_chain_state', () => {
          return HttpResponse.json({
            data: {
              last_seq: 1234,
              last_hash: 'abc123def456...',
              updated_at: new Date().toISOString(),
            },
            error: null,
          });
        }),
      ],
    },
  },
};

export const Verified: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('*/rpc/get_audit_chain_state', () => {
          return HttpResponse.json({
            data: { last_seq: 2, last_hash: 'h2', updated_at: new Date().toISOString() },
            error: null,
          });
        }),
        http.get('*/rest/v1/rpc/get_activity_logs_for_verification', () => {
          return HttpResponse.json([]);
        }),
      ],
    },
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Click Verify', async () => {
      const verifyBtn = await canvas.findByRole('button', { name: /verify/i });
      await userEvent.click(verifyBtn);
    });

    // We passed an empty array, so it immediately returns Valid.
    await step('Check Success Message', async () => {
      // The translation key is status_chain_intact
      expect(await canvas.findByText(/intact/i)).toBeInTheDocument();
    });
  },
};

export const Tampered: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('*/rpc/get_audit_chain_state', () => {
          return HttpResponse.json({
            data: { last_seq: 2, last_hash: 'h2', updated_at: new Date().toISOString() },
            error: null,
          });
        }),
        http.get('*/rest/v1/rpc/get_activity_logs_for_verification', () => {
          return HttpResponse.json([
            { seq: 1, prev_hash: 'GENESIS', entry_hash: 'bad-hash', payload: {} },
          ]);
        }),
      ],
    },
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Click Verify', async () => {
      const verifyBtn = await canvas.findByRole('button', { name: /verify/i });
      await userEvent.click(verifyBtn);
    });

    // We passed invalid hashes, verifyHashChain will fail validation
    await step('Check Tamper Alert', async () => {
      // status_tamper_detected
      expect(await canvas.findByText(/tamper/i)).toBeInTheDocument();
    });
  },
};
