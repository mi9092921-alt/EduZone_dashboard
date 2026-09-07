import { http, HttpResponse } from 'msw';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { server } from '../../tests/mocks/server';

import {
  extractYoutubeId,
  getYoutubeVideoDetails,
  getYoutubeVideoDetailsBatch,
  YOUTUBE_BATCH_LIMIT,
} from './youtube.service';

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({ YOUTUBE_API_KEY: 'test-youtube-key' }),
}));

const VIDEOS_PATTERN = 'https://www.googleapis.com/youtube/v3/videos';

/** 11-char video IDs (YouTube's exact ID length) */
const makeId = (i: number) => `testid${String(i).padStart(5, '0')}`;
const urlFor = (id: string) => `https://www.youtube.com/watch?v=${id}`;

function ytItems(ids: string[]) {
  return ids.map((id) => ({
    id,
    contentDetails: { duration: 'PT1M5S' },
    snippet: { title: `Video ${id}` },
  }));
}

function videosHandler(
  items: Array<{ id: string; contentDetails: { duration: string }; snippet: { title: string } }>,
  onRequest?: (url: URL) => void,
) {
  return http.get(VIDEOS_PATTERN, ({ request }) => {
    const url = new URL(request.url);
    onRequest?.(url);
    const requested = (url.searchParams.get('id') ?? '').split(',').filter(Boolean);
    // IDs the API answered for but did not return = not found (404-equivalent)
    return HttpResponse.json({ items: ytItems(requested).filter((i) => items.some((x) => x.id === i.id)) });
  });
}

describe('youtube.service — PERF-06 batching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── (أ) valid batch → full success in a single network call ──
  it('fetches 10 videos in ONE network call with full metadata', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => makeId(i));
    const requests: URL[] = [];

    server.use(videosHandler(ytItems(ids), (url) => requests.push(url)));

    const { results, partial_failures } = await getYoutubeVideoDetailsBatch(ids.map(urlFor));

    expect(requests).toHaveLength(1); // was N separate calls before PERF-06
    expect(results.size).toBe(10);
    expect(partial_failures).toHaveLength(0);
    expect(results.get(ids[0]!)).toMatchObject({ duration_sec: 65, title: `Video ${ids[0]}` });
    // All requested ids travel in the single call's id= parameter
    expect(requests[0]!.searchParams.get('id')).toBe(ids.join(','));
    expect(requests[0]!.searchParams.get('part')).toBe('contentDetails,snippet');
  });

  it('chunks >50 ids into multiple requests (YouTube API limit)', async () => {
    const ids = Array.from({ length: YOUTUBE_BATCH_LIMIT + 10 }, (_, i) => makeId(i));
    const requests: URL[] = [];

    server.use(videosHandler(ytItems(ids), (url) => requests.push(url)));

    const { results, partial_failures } = await getYoutubeVideoDetailsBatch(ids.map(urlFor));

    expect(requests).toHaveLength(2);
    expect(results.size).toBe(ids.length);
    expect(partial_failures).toHaveLength(0);
  });

  // ── (ب) one bad video of 10 → 9 ok + 1 partial failure, no throw ──
  it('isolates a single 404 video as a partial failure (batch never fails)', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => makeId(i));
    const missing = ids[9]!;

    // API returns only 9 of the 10 requested items.
    server.use(
      http.get(VIDEOS_PATTERN, ({ request }) => {
        const url = new URL(request.url);
        const requested = (url.searchParams.get('id') ?? '').split(',').filter(Boolean);
        return HttpResponse.json({ items: ytItems(requested.filter((id) => id !== missing)) });
      }),
    );

    const { results, partial_failures } = await getYoutubeVideoDetailsBatch(ids.map(urlFor));

    expect(results.size).toBe(9);
    expect(partial_failures).toEqual([{ url_or_id: urlFor(missing), reason: 'video_not_found' }]);
  });

  // ── (ج) slow response > timeout → explicit timeout failure ──
  it('aborts slow responses with an explicit youtube_timeout failure', async () => {
    const ids = Array.from({ length: 3 }, (_, i) => makeId(i));

    server.use(
      http.get(
        VIDEOS_PATTERN,
        () =>
          new Promise((resolve) => {
            // Longer than the 100ms test timeout, far shorter than vitest's budget
            setTimeout(() => resolve(HttpResponse.json({ items: ytItems(ids) })), 1500);
          }),
      ),
    );

    const started = Date.now();
    const { results, partial_failures } = await getYoutubeVideoDetailsBatch(ids.map(urlFor), {
      timeoutMs: 100,
    });
    const elapsed = Date.now() - started;

    expect(results.size).toBe(0);
    expect(partial_failures).toHaveLength(3);
    expect(partial_failures.every((f) => f.reason === 'youtube_timeout')).toBe(true);
    // Aborted at ~100ms instead of hanging until the 1500ms response
    expect(elapsed).toBeLessThan(1200);
  });

  // ── 429 → exactly one retry after backoff, then success ──
  it('retries once after backoff on HTTP 429 and succeeds', async () => {
    const ids = Array.from({ length: 2 }, (_, i) => makeId(i));
    let calls = 0;

    server.use(
      http.get(VIDEOS_PATTERN, ({ request }) => {
        calls++;
        const url = new URL(request.url);
        const requested = (url.searchParams.get('id') ?? '').split(',').filter(Boolean);
        if (calls === 1) return HttpResponse.json({ error: 'rate limit' }, { status: 429 });
        return HttpResponse.json({ items: ytItems(requested) });
      }),
    );

    const { results, partial_failures } = await getYoutubeVideoDetailsBatch(ids.map(urlFor), {
      retryDelayMs: 10,
    });

    expect(calls).toBe(2);
    expect(results.size).toBe(2);
    expect(partial_failures).toHaveLength(0);
  });

  it('surfaces a non-429 API error as per-video failures without throwing', async () => {
    const ids = [makeId(1)];

    server.use(
      http.get(VIDEOS_PATTERN, () => HttpResponse.json({ error: 'quota' }, { status: 403 })),
    );

    const { results, partial_failures } = await getYoutubeVideoDetailsBatch(ids.map(urlFor));

    expect(results.size).toBe(0);
    expect(partial_failures).toEqual([
      { url_or_id: urlFor(ids[0]!), reason: 'youtube_api_status_403' },
    ]);
  });

  it('flags inputs with no extractable video id as invalid', async () => {
    server.use(videosHandler([]));

    const { results, partial_failures } = await getYoutubeVideoDetailsBatch(['not-a-youtube-url']);

    expect(results.size).toBe(0);
    expect(partial_failures).toEqual([
      { url_or_id: 'not-a-youtube-url', reason: 'invalid_youtube_id' },
    ]);
  });

  // ── single-video path delegates to the batched implementation ──
  it('getYoutubeVideoDetails still resolves a single video (via the batch path)', async () => {
    const id = makeId(1);
    server.use(videosHandler(ytItems([id])));

    const metadata = await getYoutubeVideoDetails(urlFor(id));

    expect(metadata).toMatchObject({ id, duration_sec: 65 });
  });

  it('getYoutubeVideoDetails returns null for an unknown video', async () => {
    server.use(videosHandler([]));

    const metadata = await getYoutubeVideoDetails(urlFor(makeId(99)));

    expect(metadata).toBeNull();
  });

  it('extractYoutubeId still handles plain ids', () => {
    expect(extractYoutubeId(makeId(1))).toBe(makeId(1));
    expect(extractYoutubeId(urlFor(makeId(1)))).toBe(makeId(1));
  });
});