import type Database from 'better-sqlite3';

import { sha256Hex, storeFile } from '../fileStore/contentStore.js';
import { generateId } from '../ids/generateId.js';

import { parseWarnings, serializeWarnings } from './json.js';
import { CreateJobInputSchema, JobSchema, type CreateJobInput, type Job } from './types.js';

interface JobRow {
  id: string;
  title: string;
  original_filename: string;
  file_sha256: string;
  raw_text: string;
  parse_status: string;
  parse_confidence: number | null;
  warnings: string;
  language: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: JobRow): Job {
  return JobSchema.parse({
    id: row.id,
    title: row.title,
    originalFilename: row.original_filename,
    fileSha256: row.file_sha256,
    rawText: row.raw_text,
    parseStatus: row.parse_status,
    parseConfidence: row.parse_confidence,
    warnings: parseWarnings(row.warnings),
    language: row.language,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * Unlike candidates, jobs are NOT deduplicated by content hash: reposting
 * the same job description text under a second requisition is a legitimate
 * recruiter workflow, not an accidental re-upload. The original bytes are
 * still stored content-addressed (ADR-008) — two jobs from identical bytes
 * simply point at the same stored file.
 */
export function createJob(db: Database.Database, filesDir: string, input: CreateJobInput): Job {
  const parsed = CreateJobInputSchema.parse(input);
  const sha256 = sha256Hex(parsed.fileBytes);
  storeFile(filesDir, parsed.fileBytes);

  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO jobs
       (id, title, original_filename, file_sha256, raw_text, parse_status, parse_confidence, warnings, language, source_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    parsed.title,
    parsed.originalFilename,
    sha256,
    parsed.rawText,
    parsed.parseStatus,
    parsed.parseConfidence,
    serializeWarnings(parsed.warnings),
    parsed.language,
    parsed.sourceUrl ?? null,
    now,
    now,
  );

  const row = db.prepare<[string], JobRow>('SELECT * FROM jobs WHERE id = ?').get(id);
  if (row === undefined) {
    throw new Error(`createJob: insert of ${id} succeeded but the row was not found on read-back`);
  }
  return mapRow(row);
}

export function getJobById(db: Database.Database, id: string): Job | null {
  const row = db.prepare<[string], JobRow>('SELECT * FROM jobs WHERE id = ?').get(id);
  return row === undefined ? null : mapRow(row);
}

export function listJobs(db: Database.Database): Job[] {
  const rows = db.prepare<[], JobRow>('SELECT * FROM jobs ORDER BY created_at ASC, id ASC').all();
  return rows.map(mapRow);
}
