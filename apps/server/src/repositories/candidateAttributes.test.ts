import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../db/connection.js';
import { createOrGetCandidate } from './candidates.js';
import { addCandidateAttribute, listCandidateAttributes } from './candidateAttributes.js';

import type Database from 'better-sqlite3';

describe('candidate attributes repository', () => {
  let dataDir: string;
  let db: Database.Database;
  let filesDir: string;
  let candidateId: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-attrs-repo-'));
    db = openDatabase({ dataDir });
    filesDir = path.join(dataDir, 'files');
    const { candidate } = createOrGetCandidate(db, filesDir, {
      fileBytes: Buffer.from('candidate bytes'),
      originalFilename: 'cand.pdf',
      rawText: 'Skilled in Python and Go',
      parseStatus: 'ok',
      parseConfidence: 0.9,
      warnings: [],
      language: 'en',
    });
    candidateId = candidate.id;
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('adds an attribute anchored to an evidence span and reads it back', () => {
    const attr = addCandidateAttribute(db, {
      candidateId,
      attributeType: 'skill',
      value: 'Python',
      evidenceStart: 11,
      evidenceEnd: 17,
    });

    expect(attr.candidateId).toBe(candidateId);
    expect(attr.attributeType).toBe('skill');
    expect(attr.value).toBe('Python');
    expect(attr.evidenceStart).toBe(11);
    expect(attr.evidenceEnd).toBe(17);
  });

  it('rejects an attribute for a candidate that does not exist (real FK enforcement)', () => {
    expect(() =>
      addCandidateAttribute(db, {
        candidateId: 'nonexistent',
        attributeType: 'skill',
        value: 'Go',
        evidenceStart: null,
        evidenceEnd: null,
      }),
    ).toThrow(/FOREIGN KEY/);
  });

  it('listCandidateAttributes returns only attributes for the given candidate', () => {
    addCandidateAttribute(db, {
      candidateId,
      attributeType: 'skill',
      value: 'Python',
      evidenceStart: null,
      evidenceEnd: null,
    });
    addCandidateAttribute(db, {
      candidateId,
      attributeType: 'skill',
      value: 'Go',
      evidenceStart: null,
      evidenceEnd: null,
    });

    const attrs = listCandidateAttributes(db, candidateId);
    expect(attrs.map((a) => a.value)).toEqual(['Python', 'Go']);
  });
});
