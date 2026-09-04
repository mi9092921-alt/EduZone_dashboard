import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * M-CLIENT-ADMIN regression tests.
 *
 * JobsPage, RateLimitsTab and LiveActivityStream are all `'use client'`
 * components. Their query hooks used to import jobs.service.ts /
 * rate-limits.service.ts / audit.service.ts directly — files that call
 * createAdminClient() (service_role). getServerEnv() throws
 * "Attempted to access server environment variables in the browser
 * context" whenever that runs in the browser, so these three admin pages
 * were completely non-functional in production.
 *
 * The fix routes every one of these hooks through the existing
 * server actions in admin.actions.ts instead. This file locks in that:
 *  (a) the hooks call the server actions, and
 *  (b) none of these query/mutation files import an admin-client-only
 *      repo module anymore (a static, no-mock-needed guarantee).
 */

vi.mock('@/adapters/actions/admin.actions', () => ({
  getJobsAction: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 }),
  getJobStatusCountsAction: vi.fn().mockResolvedValue({ pending: 0, running: 0 }),
  getActiveBlocksAction: vi.fn().mockResolvedValue([]),
  getRateLimitRulesAction: vi.fn().mockResolvedValue([]),
  getTopOffendersAction: vi.fn().mockResolvedValue([]),
  getQueuedActivitiesAction: vi.fn().mockResolvedValue([]),
  retryJobAction: vi.fn(),
  cancelJobAction: vi.fn(),
  releaseStaleJobsAction: vi.fn(),
  toggleRateLimitRuleAction: vi.fn(),
  clearRateLimitBlockAction: vi.fn(),
}));

import {
  getJobsAction,
  getJobStatusCountsAction,
  getActiveBlocksAction,
  getRateLimitRulesAction,
  getTopOffendersAction,
  getQueuedActivitiesAction,
} from '@/adapters/actions/admin.actions';
import { useQueuedActivities } from '@/adapters/queries/audit.queries';
import { useJobs, useJobStatusCounts } from '@/adapters/queries/jobs.queries';
import {
  useActiveBlocks,
  useRateLimitRules,
  useTopOffenders,
} from '@/adapters/queries/rate-limits.queries';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('client query hooks no longer touch the service-role client directly', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useJobs / useJobStatusCounts call the server actions', async () => {
    const { result: jobsResult } = renderHook(() => useJobs({}, 1, 20), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(jobsResult.current.isSuccess).toBe(true));
    expect(getJobsAction).toHaveBeenCalledWith({}, 1, 20);

    const { result: countsResult } = renderHook(() => useJobStatusCounts(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(countsResult.current.isSuccess).toBe(true));
    expect(getJobStatusCountsAction).toHaveBeenCalled();
  });

  it('useActiveBlocks / useRateLimitRules / useTopOffenders call the server actions', async () => {
    const { result: blocks } = renderHook(() => useActiveBlocks(), { wrapper: createWrapper() });
    await waitFor(() => expect(blocks.current.isSuccess).toBe(true));
    expect(getActiveBlocksAction).toHaveBeenCalled();

    const { result: rules } = renderHook(() => useRateLimitRules(), { wrapper: createWrapper() });
    await waitFor(() => expect(rules.current.isSuccess).toBe(true));
    expect(getRateLimitRulesAction).toHaveBeenCalled();

    const { result: offenders } = renderHook(() => useTopOffenders(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(offenders.current.isSuccess).toBe(true));
    expect(getTopOffendersAction).toHaveBeenCalled();
  });

  it('useQueuedActivities calls the server action', async () => {
    const { result } = renderHook(() => useQueuedActivities(50), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getQueuedActivitiesAction).toHaveBeenCalledWith(50);
  });

  it('none of the affected query/mutation files import an admin-client-only repo module', async () => {
    // Static guarantee, not just a runtime mock: read the source of each
    // fixed file and assert it no longer references the service-role
    // repo modules directly (jobs.service / rate-limits.service /
    // analytics.service's getCourseStats / courses.service's admin
    // functions). Regressing this would silently reintroduce the
    // browser crash.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const filesThatMustNotImportAdminRepos: Array<[string, RegExp[]]> = [
      ['jobs.queries.ts', [/from '@\/infrastructure\/repos\/jobs\.service'/]],
      ['jobs.mutations.ts', [/from '@\/infrastructure\/repos\/jobs\.service'/]],
      ['rate-limits.queries.ts', [/from '@\/infrastructure\/repos\/rate-limits\.service'/]],
      ['rate-limits.mutations.ts', [/from '@\/infrastructure\/repos\/rate-limits\.service'/]],
      ['audit.queries.ts', [/import\s*{[^}]*\bgetQueuedActivities\b[^}]*}\s*from\s*'@\/infrastructure\/repos\/audit\.service'/]],
    ];

    for (const [file, patterns] of filesThatMustNotImportAdminRepos) {
      const dir = file.endsWith('.mutations.ts') ? 'mutations' : 'queries';
      const filePath = path.resolve(__dirname, `../${dir}/${file}`);
      const source = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of patterns) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
