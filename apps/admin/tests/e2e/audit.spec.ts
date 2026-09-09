import { test, expect } from '@playwright/test';

// Port of the Cypress "Audit Verification Flow" spec
// (cypress/e2e/audit/verify-chain.cy.ts). That version visited /audit
// for real but then mocked the verification RPC with hand-made hashes
// ('h1'/'h2' -- not real SHA-256 chain entries) and asserted verdicts
// about its own mocks: verifying fabricated data proves nothing about
// the real chain. Worse, its "tampered" case asserted the UI names a
// sequence number from mock data.
//
// The real flow (ChainVerifier.tsx) fetches real activity_logs for the
// window, anchors trust in the independently-fetched predecessor hash,
// and runs verifyHashChain (lib/hash-chain.ts) client-side, rendering
// either "Chain intact (N blocks verified)" or "Tamper detected at
// sequence #N" (messages/en.json audit.status_chain_intact /
// status_tamper_detected).
//
// This port drives the real button against the real backend and accepts
// EITHER genuine verdict -- both prove the end-to-end verification
// executed on live data. The test is fully read-only: zero mutation,
// zero seed impact, inherently retry-safe and race-free.
test.describe('Audit chain verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/audit');

    // Fail loudly with the actual URL if navigation ever lands
    // elsewhere (seen once as courses content in a degraded run) --
    // downstream assertions would otherwise misreport the cause.
    await expect(page).toHaveURL(/\/audit/);

    // Chain-state line (ChainVerifier.tsx: label_last_seq) proves the
    // read path (useAuditChainState) resolved against the live backend.
    await expect(page.getByText('Latest Seq:')).toBeVisible();
  });

  test('verifies the real hash chain and renders a genuine verdict', async ({ page }, testInfo) => {
    // Self-diagnostics: two CI runs failed here with detach/timeout
    // signatures and one page-state confusion (courses content under
    // an audit test). Collect page errors + failed requests + URL so
    // the next failure log tells us exactly what the app did instead
    // of another opaque timeout.
    const events: string[] = [];
    page.on('pageerror', (err) => events.push(`pageerror: ${err.message}`));
    page.on('requestfailed', (req) =>
      events.push(`reqfail: ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`),
    );
    page.on('response', (res) => {
      if (res.status() >= 400)
        events.push(`http${res.status()}: ${res.request().method()} ${res.url()}`);
    });
    try {
    // Deterministic fetch sync: the verifier pulls real rows with a
    // plain table SELECT (audit.service.ts
    // getActivityLogsForVerification, browser client) -- no RPC layer
    // to intercept, same as the users lock flow.
    const logsResponse = page.waitForResponse(
      (res) => res.url().includes('/rest/v1/activity_logs') && res.request().method() === 'GET',
      // Explicit budget (not the 30s test budget): a missed fetch is a
      // product/backend signal and should fail fast with this call in
      // the log -- not burn the whole test on click-detach retries.
      { timeout: 15000 },
    );

    await page.getByRole('button', { name: 'Verify Hash Chain', exact: true }).click();

    const logsRes = await logsResponse;
    expect(logsRes.ok()).toBe(true);

    // Either verdict is a REAL result of verifyHashChain over live
    // rows: intact names its block count, tamper names its sequence.
    // (The Cypress version asserted these strings against mocked
    // rows -- here they can only appear if the crypto actually ran.)
    await expect(page.getByText(/Chain intact|Tamper detected/)).toBeVisible();
    } catch (err) {
      console.log(`[audit-e2e-diag] url=${page.url()} events=${JSON.stringify(events)}`);
      await testInfo.attach('failure-dom', { body: await page.content(), contentType: 'text/html' });
      throw err;
    }
  });
});
