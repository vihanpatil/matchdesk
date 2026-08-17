-- 0004_job_scoring_configs.sql
--
-- The bridge between a stored job and the scoring engine (ADR-035).
--
-- Until this table, every `ScoringJob` spec in the project's history was
-- hand-built inside a test: there was no way for a recruiter's confirmed
-- requirements to reach `scoreCandidate` at all. The UI cannot exist without
-- this bridge.
--
-- * One row per job: the config IS the recruiter's confirmed scoring spec, so
--   a second concurrent spec for the same job has no meaning. Upsert replaces.
-- * `config` is a JSON blob validated by zod (`JobScoringConfigSchema`) on
--   every write AND every read, mirroring `packages/core`'s `Job` shape minus
--   `id`. A compile-time assertion in the repository pins the two shapes
--   together, so drift between the stored shape and the engine's input is a
--   type error, not a runtime surprise.
-- * A blob rather than relational rows, deliberately: the spec is consumed
--   whole by the engine and never queried relationally. The existing
--   `job_requirements` table remains the DISPLAY/evidence layer
--   (label + span, per PRODUCT_DECISIONS); this is the ENGINE layer.

CREATE TABLE job_scoring_configs (
  job_id      TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  config      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
