# Downloads layout proposal — rejected

This is a historical proposal and is not an instruction to move files. The proposed `supabase/schema/downloads/` tree, `12_downloads_functions.sql`, `13_downloads_tables.sql`, `14_video_cache_and_rate_limit.sql`, and several function folders named in the original proposal are not present in the current repository.

The current layout is:

- download-related tables and SQL live in the numbered files under `supabase/schema/`;
- the implemented functions are direct children of `supabase/functions/`, including `log-download-attempt`, `validate-course-access`, and `video-info`;
- the ordered schema inputs are defined by `supabase/config.toml` and explained in [`schema/README.md`](schema/README.md).

Do not create a second active schema source or relocate functions based on this document. If a future reorganization is approved, update `config.toml`, deployment tooling, callers, tests, and all documentation together, then verify the result against both repository consumers.
