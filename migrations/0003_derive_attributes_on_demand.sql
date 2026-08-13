-- 0003_derive_attributes_on_demand.sql
--
-- Closes HONESTY_LOG H-052 by removing the thing that could drift (ADR-024).
--
-- THE DEFECT. Extraction is a function of TWO inputs —
-- `extractAttributes(rawText, referenceDate)` — but `candidate_attributes`
-- persisted only the OUTPUT. `rawText` is content-addressed and cannot drift;
-- `referenceDate` was a free per-call parameter and did. For any CV with an
-- open-ended range ("Jan 2019 - Present") the stored evidence and the score
-- diverged permanently, purely through time passing:
--
--     ingest at referenceDate 2026-01  ->  stored years_experience = 7
--     score  at referenceDate 2040-01  ->  scored on years_experience = 21
--     stored rows still said 7
--
-- The recruiter would see evidence reading 7 years beside a score computed
-- from 21, in a product whose stated principle is that every number traces to
-- highlighted evidence in the source.
--
-- THE FIX. Stop persisting derived attributes. `raw_text` plus the engine
-- version plus the reference date fully determine them, extraction is pure and
-- costs 0.76 ms/document (measured, scripts/measure-matrix.mjs), so evidence is
-- derived at the moment it is needed and cannot disagree with the number it
-- justifies. Divergence becomes impossible by construction rather than
-- prevented by a check somebody could remove.
--
-- WHAT REPLACES THE TABLE. A score is only explainable if you can re-derive
-- exactly what produced it, so `matches` gains `reference_date`: together with
-- the `engine_version` it already carried, every stored score is now
-- reproducible from stored state alone. Provenance moves to where the number
-- lives instead of sitting on a copy of the evidence.

DROP TABLE candidate_attributes;

-- The third input to extraction, recorded next to the score it produced.
-- Nullable because pre-existing rows predate it; every row written from here
-- on sets it, and a NULL means "this score cannot be reproduced" — which is
-- the honest reading rather than a silent default.
ALTER TABLE matches ADD COLUMN reference_date TEXT;
