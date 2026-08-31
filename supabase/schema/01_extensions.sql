-- Canonical schema source. supabase/schema/ (this file and its siblings, per
-- supabase/config.toml schema_paths) is the single source of truth -- no
-- migrations, patches, or external SQL files. Historical note: originally
-- generated from a monolithic Eduzone_schema_v13.sql during a normalization
-- pass (#3, ownership rules); that file no longer exists in this repo.
CREATE SCHEMA IF NOT EXISTS private;

CREATE SCHEMA IF NOT EXISTS audit;

CREATE SCHEMA IF NOT EXISTS internal;

CREATE SCHEMA IF NOT EXISTS maintenance;

CREATE SCHEMA IF NOT EXISTS archive;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Used only by the backend cron invoker for short Edge Function requests.
-- The URL and service-role credential are read from Supabase Vault, never
-- stored in this schema or exposed to clients.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- pg_partman intentionally NOT installed: partitioning is implemented natively
-- via maintenance.create_next_partition_if_not_exists() / manage_partitions()
-- (declarative range partitioning + explicit yearly partition creation).
-- pg_partman was previously installed but never referenced anywhere in this
-- schema (verified by repo-wide search) -- an unused extension is unnecessary
-- attack/maintenance surface, so it is removed rather than left dormant.
