import { describe, it, expect } from 'vitest';

import { verifyHashChain } from './hash-chain';

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('verifyHashChain', () => {
  it('returns valid for empty logs', async () => {
    const result = await verifyHashChain([], 'genesis');
    expect(result).toEqual({ valid: true, entriesVerified: 0 });
  });

  it('verifies a valid chain of logs', async () => {
    const genesis = 'genesis_hash';
    const log1 = {
      seq: 1,
      id: 'log1',
      user_id: 'userA',
      activity_type: 'LOGIN',
      details: { ip: '127.0.0.1' },
      prev_hash: genesis,
      entry_hash: '',
    };
    log1.entry_hash = await sha256(`1log1userALOGIN{"ip": "127.0.0.1"}${genesis}`);

    const log2 = {
      seq: 2,
      id: 'log2',
      user_id: null,
      activity_type: 'SYSTEM_CRON',
      details: null,
      prev_hash: log1.entry_hash,
      entry_hash: '',
    };
    log2.entry_hash = await sha256(`2log2systemSYSTEM_CRONnull${log1.entry_hash}`);

    const logs = [log1, log2] as any;

    // Test progress callback
    let progress = 0;
    const result = await verifyHashChain(logs, genesis, (pct) => {
      progress = pct;
    });

    expect(result).toEqual({ valid: true, entriesVerified: 2 });
    expect(progress).toBe(100);
  });

  it('fails when entry_hash is tampered', async () => {
    const genesis = 'genesis_hash';
    const log1 = {
      seq: 1,
      id: 'log1',
      user_id: 'userA',
      activity_type: 'LOGIN',
      details: { ip: '127.0.0.1' },
      prev_hash: genesis,
      entry_hash: 'fake_hash',
    };

    const logs = [log1] as any;
    const result = await verifyHashChain(logs, genesis);
    expect(result).toEqual({ valid: false, entriesVerified: 0, failedAtSeq: 1 });
  });

  it('fails when prev_hash is broken', async () => {
    const genesis = 'genesis_hash';
    const log1 = {
      seq: 1,
      id: 'log1',
      user_id: 'userA',
      activity_type: 'LOGIN',
      details: { ip: '127.0.0.1' },
      prev_hash: 'wrong_prev',
      entry_hash: '',
    };
    // compute correct hash for wrong prev_hash payload
    log1.entry_hash = await sha256(`1log1userALOGIN{"ip":"127.0.0.1"}wrong_prev`);

    const logs = [log1] as any;
    const result = await verifyHashChain(logs, genesis);
    expect(result).toEqual({ valid: false, entriesVerified: 0, failedAtSeq: 1 });
  });
});
