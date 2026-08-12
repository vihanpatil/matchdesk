import type Database from 'better-sqlite3';

import { generateId } from '../ids/generateId.js';

import {
  CandidateAttributeSchema,
  CreateCandidateAttributeInputSchema,
  type CandidateAttribute,
  type CreateCandidateAttributeInput,
} from './types.js';

interface CandidateAttributeRow {
  id: string;
  candidate_id: string;
  attribute_type: string;
  value: string;
  evidence_start: number | null;
  evidence_end: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: CandidateAttributeRow): CandidateAttribute {
  return CandidateAttributeSchema.parse({
    id: row.id,
    candidateId: row.candidate_id,
    attributeType: row.attribute_type,
    value: row.value,
    evidenceStart: row.evidence_start,
    evidenceEnd: row.evidence_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function addCandidateAttribute(
  db: Database.Database,
  input: CreateCandidateAttributeInput,
): CandidateAttribute {
  const parsed = CreateCandidateAttributeInputSchema.parse(input);
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO candidate_attributes
       (id, candidate_id, attribute_type, value, evidence_start, evidence_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    parsed.candidateId,
    parsed.attributeType,
    parsed.value,
    parsed.evidenceStart,
    parsed.evidenceEnd,
    now,
    now,
  );

  const row = db
    .prepare<[string], CandidateAttributeRow>('SELECT * FROM candidate_attributes WHERE id = ?')
    .get(id);
  if (row === undefined) {
    throw new Error(
      `addCandidateAttribute: insert of ${id} succeeded but the row was not found on read-back`,
    );
  }
  return mapRow(row);
}

export function listCandidateAttributes(
  db: Database.Database,
  candidateId: string,
): CandidateAttribute[] {
  const rows = db
    .prepare<[string], CandidateAttributeRow>(
      'SELECT * FROM candidate_attributes WHERE candidate_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(candidateId);
  return rows.map(mapRow);
}
