# log-download-attempt

Supabase Edge Function that records a successful offline download attempt for analytics.

## Input

```json
{
  "lesson_id": "uuid",
  "quality": "720p",
  "access_expires_at": "2026-12-01T00:00:00Z"  // or null
}
```

## Output

```json
{ "success": true }
```

## Notes

- This function should be called only after the download has completed successfully.
- `access_expires_at` in the request body is only a hint for logging when the
  server-side lookup below finds nothing; it is **not** trusted or written
  verbatim. The function independently re-derives the caller's real active
  enrollment expiry from `enrollments` (same lookup `validate-course-access`
  performs, RLS-scoped to the caller) and stores that value instead, so the
  `download_logs` audit trail cannot be spoofed by a client sending an
  arbitrary `access_expires_at`.
- The function writes the record to `download_logs` for analytics, but must not block playback flow.
- `download_logs` carries no authorization power: offline playback is gated
  entirely by the client's `OfflinePolicyEngine` against locally
  HMAC-signed metadata, not by this table. This function exists purely to
  keep the audit/observability trail honest.
