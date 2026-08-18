-- 0005_job_source_url.sql
--
-- ADR-037: a job can now be ingested from a pasted link. The URL is recorded
-- for provenance — a recruiter with twenty jobs needs to know which posting a
-- row came from, and "the filename" of a fetched page is synthesized rather
-- than chosen by them. NULL for file uploads. Deleted with the row (the
-- existing DELETE cascade and audit path apply unchanged; the audit entry
-- itself stays opaque-id-only per PRODUCT_DECISIONS).
ALTER TABLE jobs ADD COLUMN source_url TEXT;
