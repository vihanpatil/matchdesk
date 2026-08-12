import type Database from 'better-sqlite3';

import { generateId } from '../ids/generateId.js';

import {
  CreateJobRequirementInputSchema,
  JobRequirementSchema,
  type CreateJobRequirementInput,
  type JobRequirement,
} from './types.js';

interface JobRequirementRow {
  id: string;
  job_id: string;
  label: string;
  is_hard_requirement: number;
  evidence_start: number | null;
  evidence_end: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: JobRequirementRow): JobRequirement {
  return JobRequirementSchema.parse({
    id: row.id,
    jobId: row.job_id,
    label: row.label,
    isHardRequirement: row.is_hard_requirement === 1,
    evidenceStart: row.evidence_start,
    evidenceEnd: row.evidence_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function addJobRequirement(
  db: Database.Database,
  input: CreateJobRequirementInput,
): JobRequirement {
  const parsed = CreateJobRequirementInputSchema.parse(input);
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO job_requirements
       (id, job_id, label, is_hard_requirement, evidence_start, evidence_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    parsed.jobId,
    parsed.label,
    parsed.isHardRequirement ? 1 : 0,
    parsed.evidenceStart,
    parsed.evidenceEnd,
    now,
    now,
  );

  const row = db
    .prepare<[string], JobRequirementRow>('SELECT * FROM job_requirements WHERE id = ?')
    .get(id);
  if (row === undefined) {
    throw new Error(
      `addJobRequirement: insert of ${id} succeeded but the row was not found on read-back`,
    );
  }
  return mapRow(row);
}

export function listJobRequirements(db: Database.Database, jobId: string): JobRequirement[] {
  const rows = db
    .prepare<[string], JobRequirementRow>(
      'SELECT * FROM job_requirements WHERE job_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(jobId);
  return rows.map(mapRow);
}
