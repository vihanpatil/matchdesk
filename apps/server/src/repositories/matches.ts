import type Database from 'better-sqlite3';

import { generateId } from '../ids/generateId.js';

import { MatchSchema, UpsertMatchInputSchema, type Match, type UpsertMatchInput } from './types.js';

interface MatchRow {
  id: string;
  job_id: string;
  candidate_id: string;
  score: number | null;
  engine_version: string | null;
  embedding_model_revision: string | null;
  computed_at: string | null;
  reference_date: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: MatchRow): Match {
  return MatchSchema.parse({
    id: row.id,
    jobId: row.job_id,
    candidateId: row.candidate_id,
    score: row.score,
    engineVersion: row.engine_version,
    embeddingModelRevision: row.embedding_model_revision,
    computedAt: row.computed_at,
    referenceDate: row.reference_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * Creates a match, or updates the existing one for the same
 * `(jobId, candidateId)` pair — the table's UNIQUE constraint is the
 * dedup key. Re-scoring a pair (e.g. after an embedding model revision
 * bump — ADR-002) replaces the prior score in place rather than
 * accumulating stale rows.
 */
export function upsertMatch(db: Database.Database, input: UpsertMatchInput): Match {
  const parsed = UpsertMatchInputSchema.parse(input);
  const now = new Date().toISOString();
  const newId = generateId();

  db.prepare(
    `INSERT INTO matches
       (id, job_id, candidate_id, score, engine_version, embedding_model_revision, computed_at, reference_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (job_id, candidate_id) DO UPDATE SET
       score = excluded.score,
       engine_version = excluded.engine_version,
       embedding_model_revision = excluded.embedding_model_revision,
       computed_at = excluded.computed_at,
       reference_date = excluded.reference_date,
       updated_at = excluded.updated_at`,
  ).run(
    newId,
    parsed.jobId,
    parsed.candidateId,
    parsed.score,
    parsed.engineVersion,
    parsed.embeddingModelRevision,
    parsed.computedAt,
    parsed.referenceDate,
    now,
    now,
  );

  const row = db
    .prepare<[string, string], MatchRow>(
      'SELECT * FROM matches WHERE job_id = ? AND candidate_id = ?',
    )
    .get(parsed.jobId, parsed.candidateId);
  if (row === undefined) {
    throw new Error(
      `upsertMatch: upsert for job=${parsed.jobId} candidate=${parsed.candidateId} succeeded but the row was not found on read-back`,
    );
  }
  return mapRow(row);
}

export function getMatch(db: Database.Database, jobId: string, candidateId: string): Match | null {
  const row = db
    .prepare<[string, string], MatchRow>(
      'SELECT * FROM matches WHERE job_id = ? AND candidate_id = ?',
    )
    .get(jobId, candidateId);
  return row === undefined ? null : mapRow(row);
}

export function listMatchesForJob(db: Database.Database, jobId: string): Match[] {
  const rows = db
    .prepare<[string], MatchRow>(
      'SELECT * FROM matches WHERE job_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(jobId);
  return rows.map(mapRow);
}
