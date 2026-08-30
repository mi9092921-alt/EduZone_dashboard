import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';

import { server } from './tests/mocks/server';

// MSW — intercept all network requests in unit/integration tests.
// onUnhandledRequest: 'error' forces every test to explicitly mock
// all network calls — prevents silent false-positives.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
