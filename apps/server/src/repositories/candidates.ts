import type Database from 'better-sqlite3';

import { sha256Hex, storeFile } from '../fileStore/contentStore.js';
import { generateId } from '../ids/generateId.js';

import { parseWarnings, serializeWarnings } from './json.js';
import {
  CandidateSchema,
  CreateCandidateInputSchema,
  type Candidate,
  type CreateCandidateInput,
} from './types.js';

interface CandidateRow {
  id: string;
  file_sha256: string;
  original_filename: string;
  raw_text: string;
  parse_status: string;
  parse_confidence: number | null;
  warnings: string;
  language: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: CandidateRow): Candidate {
  return CandidateSchema.parse({
    id: row.id,
    fileSha256: row.file_sha256,
    originalFilename: row.original_filename,
    rawText: row.raw_text,
    parseStatus: row.parse_status,
    parseConfidence: row.parse_confidence,
    warnings: parseWarnings(row.warnings),
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface CreateOrGetCandidateResult {
  candidate: Candidate;
  /** True if a candidate with this exact file hash already existed —
   *  callers use this to show "already uploaded on <date>" rather than
   *  silently creating a duplicate. */
  alreadyExisted: boolean;
}

/**
 * Dedup by content hash (Section 4): candidates are keyed by SHA-256 of the
 * original file bytes. Re-uploading identical bytes never creates a second
 * row — it returns the existing candidate (with its original `createdAt`)
 * and `alreadyExisted: true`. A re-upload's filename is NOT used to
 * overwrite the original filename already on record.
 */
export function createOrGetCandidate(
  db: Database.Database,
  filesDir: string,
  input: CreateCandidateInput,
): CreateOrGetCandidateResult {
  const parsed = CreateCandidateInputSchema.parse(input);
  const sha256 = sha256Hex(parsed.fileBytes);

  const existingRow = db
    .prepare<[string], CandidateRow>('SELECT * FROM candidates WHERE file_sha256 = ?')
    .get(sha256);

  if (existingRow !== undefined) {
    return { candidate: mapRow(existingRow), alreadyExisted: true };
  }

  storeFile(filesDir, parsed.fileBytes);

  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO candidates
       (id, file_sha256, original_filename, raw_text, parse_status, parse_confidence, warnings, language, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sha256,
    parsed.originalFilename,
    parsed.rawText,
    parsed.parseStatus,
    parsed.parseConfidence,
    serializeWarnings(parsed.warnings),
    parsed.language,
    now,
    now,
  );

  const row = db.prepare<[string], CandidateRow>('SELECT * FROM candidates WHERE id = ?').get(id);
  if (row === undefined) {
    throw new Error(
      `createOrGetCandidate: insert of ${id} succeeded but the row was not found on read-back`,
    );
  }
  return { candidate: mapRow(row), alreadyExisted: false };
}

export function getCandidateById(db: Database.Database, id: string): Candidate | null {
  const row = db.prepare<[string], CandidateRow>('SELECT * FROM candidates WHERE id = ?').get(id);
  return row === undefined ? null : mapRow(row);
}

export function listCandidates(db: Database.Database): Candidate[] {
  const rows = db
    .prepare<[], CandidateRow>('SELECT * FROM candidates ORDER BY created_at ASC, id ASC')
    .all();
  return rows.map(mapRow);
}
