import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

// PostgREST can reject a freshly-minted JWT with PGRST303 ("JWT issued at
// future") when its own cached view of "now" (the Event.mkAutoUpdate
// timestamp cache inside PostgREST) has not caught up to the token's
// `iat` yet. This is an upstream PostgREST bug, not an EduZone bug and not
// a real clock problem on the runner -- see the extensive report at
// https://github.com/orgs/supabase/discussions/48123 and the still-open
// https://github.com/PostgREST/postgrest/issues/5196. It is transient:
// minting a *new* token a few seconds later succeeds, so on this specific
// failure we retry the whole login (a fresh `iat`), not the same token,
// with backoff. Any other rejection reason (bad password, locked account,
// maintenance mode, ...) fails immediately on attempt 1 -- only PGRST303
// is treated as retryable.
const MAX_LOGIN_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2000, 4000];

setup('authenticate', async ({ page }) => {
  for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS; attempt++) {
    // Go to login page
    await page.goto('/login');

    // Fill in credentials
    // Canonical QA seed account — supabase/schema/11_seed_reference.sql (v13):
    // admin@eduzone-test.com / Admin@12345 (see supabase/AGENTS.md QA accounts
    // table). The previous value ("Test1234!", referenced from a v9-era seed)
    // no longer matches the canonical seed hash and would fail login.
    await page.getByLabel(/email/i).fill('admin@eduzone-test.com');
    await page.getByLabel(/password/i).fill('Admin@12345');

    // Capture the check_dashboard_access RPC response (if it fires) so a
    // failure here reports *why* access was denied instead of just timing
    // out on the URL assertion below.
    const rpcResponsePromise = page
      .waitForResponse((res) => res.url().includes('/rest/v1/rpc/check_dashboard_access'), {
        timeout: 20000,
      })
      .catch(() => null);

    await page.getByRole('button', { name: /login|sign in/i }).click();

    // If the app shows an inline error banner (invalid credentials, account
    // locked, maintenance mode, RPC failure, ...), surface its exact text
    // immediately instead of waiting out the full 20s URL timeout below.
    const errorBanner = page.locator('.text-destructive, [class*="destructive"]').first();
    const bannerAppeared = await errorBanner
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (bannerAppeared) {
      const bannerText = await errorBanner.textContent();
      const rpcResponse = await rpcResponsePromise;
      const rpcBody = rpcResponse ? await rpcResponse.text().catch(() => '<unreadable>') : '<RPC never fired>';

      const isJwtClockSkew =
        rpcBody.includes('PGRST303') || rpcBody.includes('JWT issued at future');

      if (isJwtClockSkew && attempt < MAX_LOGIN_ATTEMPTS) {
        const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
        await page.waitForTimeout(delayMs);
        continue;
      }

      throw new Error(
        `Login was rejected by the app (attempt ${attempt}/${MAX_LOGIN_ATTEMPTS}).\n` +
        `  Error banner: "${bannerText?.trim()}"\n` +
        `  check_dashboard_access response: ${rpcBody}`,
      );
    }

    // Wait for redirect to dashboard or localized home with generous timeout
    await expect(page).toHaveURL(/.*(dashboard|activities|en|ar)$/, { timeout: 20000 });

    // Wait for sidebar to be visible (evidence of successful auth)
    await expect(page.getByRole('navigation')).toBeVisible();

    // End of authentication steps
    await page.context().storageState({ path: authFile });
    return;
  }
});
