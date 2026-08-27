-- Downloads: Tables
-- video_cache + download_logs only.
-- rate_limit_logs removed (rate limiting dropped for free plan).


-- ─────────────────────────────────────────────────────────────────────────────
-- video_cache
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_cache (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  url        text        NOT NULL,
  url_hash   text        UNIQUE NOT NULL,
  data       jsonb       NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_hash
  ON public.video_cache (url_hash);

-- Cleanup (run daily):
-- DELETE FROM public.video_cache WHERE expires_at < now();


-- ─────────────────────────────────────────────────────────────────────────────
-- download_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.download_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        REFERENCES auth.users(id),
  lesson_id         uuid,
  course_id         uuid,
  quality           text,
  downloaded_at     timestamptz DEFAULT now(),
  access_expires_at timestamptz   -- null = lifetime access
);