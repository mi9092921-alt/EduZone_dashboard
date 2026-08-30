import { setupServer } from 'msw/node';

import { rpcHandlers } from './handlers/rpc.handlers';

/**
 * MSW server for unit and integration tests.
 * Lifecycle managed in vitest.setup.ts (beforeAll / afterEach / afterAll).
 */
export const server = setupServer(...rpcHandlers);
