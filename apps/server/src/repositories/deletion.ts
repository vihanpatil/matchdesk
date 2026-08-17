import { unlinkSync } from 'node:fs';

import type Database from 'better-sqlite3';

import { getStoredFilePath } from '../fileStore/contentStore.js';
import { appendAuditLog } from './auditLog.js';

/**
 * Explicit deletion (ADR-035; PRODUCT_DECISIONS: "Data persists locally until
 * explicit deletion. Deletion removes original files and derived candidate/job
 * data; an append-only local audit record may retain only an opaque ID,
 * timestamp, and deletion action — never PII or source text.")
 *
 * Derived rows (requirements, scoring configs, matches, attributes) go via
 * `ON DELETE CASCADE`, which the schema already declares — nothing here
 * re-implements it. The stored file is content-addressed and could in
 * principle be shared by another row (the same bytes uploaded as both a job
 * and a candidate), so it is unlinked only when no other row references its
 * hash. The audit entry carries the opaque id and nothing else.
 */

function fileReferenceCount(db: Database.Database, sha256: string): number {
  const row = db
    .prepare<[string, string], { n: number }>(
      'SELECT (SELECT COUNT(*) FROM candidates WHERE file_sha256 = ?) + (SELECT COUNT(*) FROM jobs WHERE file_sha256 = ?) AS n',
    )
    .get(sha256, sha256);
  return row?.n ?? 0;
}

function deleteEntity(
  db: Database.Database,
  filesDir: string,
  table: 'candidates' | 'jobs',
  id: string,
): boolean {
  const row = db
    .prepare<[string], { file_sha256: string }>(`SELECT file_sha256 FROM ${table} WHERE id = ?`)
    .get(id);
  if (row === undefined) return false;

  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);

  if (fileReferenceCount(db, row.file_sha256) === 0) {
    try {
      unlinkSync(getStoredFilePath(filesDir, row.file_sha256));
    } catch (error: unknown) {
      // The row is gone either way; a missing file is the desired end state.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  appendAuditLog(db, {
    entityType: table === 'candidates' ? 'candidate' : 'job',
    entityId: id,
    action: 'deleted',
    details: null, // never PII, never source text
  });
  return true;
}

/** Deletes a candidate, its cascaded rows, and its file. False if unknown id. */
export function deleteCandidate(db: Database.Database, filesDir: string, id: string): boolean {
  return deleteEntity(db, filesDir, 'candidates', id);
}

/** Deletes a job, its cascaded rows, and its file. False if unknown id. */
export function deleteJob(db: Database.Database, filesDir: string, id: string): boolean {
  return deleteEntity(db, filesDir, 'jobs', id);
}
