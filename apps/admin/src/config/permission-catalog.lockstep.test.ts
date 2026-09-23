import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PERMISSION_NAMES } from '@eduzone/types';
import { describe, expect, it } from 'vitest';


/**
 * PHASE 2 (G3 regression lock): the TS permission union must be byte-equal
 * to the canonical DB seed catalog. Before the PHASE 2 sync the two had
 * drifted silently (`settings.manage`/`jobs.manage` referenced from actions
 * but backed by no DB row; three seed permissions missing from the union)
 * because `requirePermission` accepted arbitrary strings. Gates are now
 * typed as `PermissionName`, and this test fails if either catalog changes
 * without the other.
 */
describe('permission catalog lockstep (G3)', () => {
  it('TS PERMISSION_NAMES === 11_seed_reference.sql permission rows', async () => {
    // Vitest serves transformed modules under a non-file import.meta.url
    // scheme, so new URL(relative, import.meta.url) is unreadable by
    // readFile. Resolve from the real file path when available, else from
    // the vitest root (apps/admin) — the security intent (byte-level catalog
    // comparison) is unchanged.
    let seedPath: string;
    try {
      const metaUrl = new URL(import.meta.url);
      seedPath =
        metaUrl.protocol === 'file:'
          ? path.resolve(
              path.dirname(fileURLToPath(metaUrl)),
              '../../../../supabase/schema/11_seed_reference.sql',
            )
          : path.resolve(process.cwd(), '../../supabase/schema/11_seed_reference.sql');
    } catch {
      seedPath = path.resolve(process.cwd(), '../../supabase/schema/11_seed_reference.sql');
    }
    const sql = await readFile(seedPath, 'utf8');

    const insertBlock = sql.match(/INSERT INTO public\.permissions[\s\S]*?ON CONFLICT/i);
    expect(insertBlock).not.toBeNull();

    const dbNames = [
      ...new Set([...(insertBlock?.[0] ?? '').matchAll(/\('([a-z_]+\.[a-z_]+)',/g)].map((m) => m[1])),
    ].sort();

    expect(dbNames.length).toBeGreaterThan(0);
    expect([...PERMISSION_NAMES].sort()).toEqual(dbNames);
  });
});
