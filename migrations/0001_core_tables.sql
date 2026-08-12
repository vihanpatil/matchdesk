-- 0001_core_tables.sql
--
-- Core tables for the thin vertical slice (ADR-011): jobs, job_requirements,
-- candidates, candidate_attributes, matches.
--
-- Design notes (Section 4 columns inferred, documented here since the
-- directive text could not be pasted into the task):
--
-- * IDs are ULIDs (TEXT, 26 chars, lexicographically sortable by creation
--   time) rather than an INTEGER AUTOINCREMENT, so IDs are stable across a
--   restore-from-backup and sortable without a separate created_at join.
-- * `parse_status` / `parse_confidence` / `warnings` / `language` are
--   duplicated on both `jobs` and `candidates` because both are ingested via
--   the same pipeline (apps/server/src/ingestion) and both can independently
--   fail to parse, contain too little text, or be in an unsupported
--   language (ADR-006, constraint C7: never silently score a document that
--   could not be read).
-- * `warnings` is stored as a JSON array (TEXT) rather than a child table —
--   it is diagnostic, not queried relationally, and keeping it inline avoids
--   a join for the common "show me the warning" read path.
-- * Evidence offsets (`evidence_start` / `evidence_end`) are raw character
--   offsets into the owning document's `raw_text`, matching ADR: ingestion
--   passes text through verbatim so offsets computed later (by
--   packages/core) still line up. They are nullable because not every
--   requirement/attribute is anchored to a text span.
-- * `matches` carries `engine_version` and `embedding_model_revision`
--   (ADR-002) so a score can always be attributed to the engine that
--   produced it, and a revision bump can be identified for re-scoring.
-- * Money/PII: none of these tables store anything beyond what the
--   recruiter uploaded; original file bytes never live here (ADR-008) —
--   only the SHA-256 hash and the original filename.

CREATE TABLE jobs (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  original_filename  TEXT NOT NULL,
  file_sha256        TEXT NOT NULL,
  raw_text           TEXT NOT NULL,
  parse_status       TEXT NOT NULL CHECK (parse_status IN ('ok', 'needs_attention', 'failed')),
  parse_confidence   REAL,
  warnings           TEXT NOT NULL DEFAULT '[]',
  language           TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE job_requirements (
  id                   TEXT PRIMARY KEY,
  job_id               TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  label                TEXT NOT NULL,
  is_hard_requirement  INTEGER NOT NULL DEFAULT 0 CHECK (is_hard_requirement IN (0, 1)),
  evidence_start       INTEGER,
  evidence_end         INTEGER,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX idx_job_requirements_job_id ON job_requirements(job_id);

CREATE TABLE candidates (
  id                 TEXT PRIMARY KEY,
  file_sha256        TEXT NOT NULL UNIQUE,
  original_filename  TEXT NOT NULL,
  raw_text           TEXT NOT NULL,
  parse_status       TEXT NOT NULL CHECK (parse_status IN ('ok', 'needs_attention', 'failed')),
  parse_confidence   REAL,
  warnings           TEXT NOT NULL DEFAULT '[]',
  language           TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE candidate_attributes (
  id               TEXT PRIMARY KEY,
  candidate_id     TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  attribute_type   TEXT NOT NULL,
  value            TEXT NOT NULL,
  evidence_start   INTEGER,
  evidence_end     INTEGER,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX idx_candidate_attributes_candidate_id ON candidate_attributes(candidate_id);

CREATE TABLE matches (
  id                         TEXT PRIMARY KEY,
  job_id                     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id               TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  score                      REAL,
  engine_version             TEXT,
  embedding_model_revision   TEXT,
  computed_at                TEXT,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL,
  UNIQUE (job_id, candidate_id)
);

CREATE INDEX idx_matches_job_id ON matches(job_id);
CREATE INDEX idx_matches_candidate_id ON matches(candidate_id);
