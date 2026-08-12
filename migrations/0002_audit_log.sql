-- 0002_audit_log.sql
--
-- Append-only audit log. Section 4 / Phase-1 gate (ADR-010): "proof that
-- UPDATE on audit_log fails" — enforced here at the SQL layer with triggers
-- rather than only at the application layer, so it holds even against a
-- future bug or a direct `sqlite3` shell session.
--
-- IMPORTANT: RAISE(ABORT, "...") with DOUBLE quotes makes SQLite parse the
-- message as a column identifier, so the statement fails with "no such
-- column" instead of the intended abort message. Single quotes are used
-- throughout for the same reason every string literal in this file is
-- single-quoted.
--
-- `updated_at` is present (every table gets created_at/updated_at) but is
-- set equal to `created_at` at insert time and can never legitimately
-- change again — the UPDATE trigger blocks that unconditionally, including
-- an attempt to touch only `updated_at`.

CREATE TABLE audit_log (
  id            TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  action        TEXT NOT NULL,
  details       TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE is not permitted');
END;

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: DELETE is not permitted');
END;
