import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../db/connection.js';
import { createOrGetCandidate } from './candidates.js';
import { createJob } from './jobs.js';
import { getMatch, listMatchesForJob, upsertMatch } from './matches.js';

import type Database from 'better-sqlite3';

describe('matches repository', () => {
  let dataDir: string;
  let db: Database.Database;
  let filesDir: string;
  let jobId: string;
  let candidateId: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-matches-repo-'));
    db = openDatabase({ dataDir });
    filesDir = path.join(dataDir, 'files');

    jobId = createJob(db, filesDir, {
      title: 'Backend Engineer',
      fileBytes: Buffer.from('job bytes'),
      originalFilename: 'job.pdf',
      rawText: 'job text',
      parseStatus: 'ok',
      parseConfidence: 0.9,
      warnings: [],
      language: 'en',
    }).id;

    candidateId = createOrGetCandidate(db, filesDir, {
      fileBytes: Buffer.from('candidate bytes'),
      originalFilename: 'cand.pdf',
      rawText: 'candidate text',
      parseStatus: 'ok',
      parseConfidence: 0.9,
      warnings: [],
      language: 'en',
    }).candidate.id;
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('creates a match on first upsert', () => {
    const match = upsertMatch(db, {
      jobId,
      candidateId,
      score: 87.5,
      engineVersion: '0.0.0',
      embeddingModelRevision: 'abc123',
      computedAt: new Date().toISOString(),
    });

    expect(match.jobId).toBe(jobId);
    expect(match.candidateId).toBe(candidateId);
    expect(match.score).toBe(87.5);
  });

  it('upserting the same (jobId, candidateId) pair again updates the same row rather than creating a second one', () => {
    const first = upsertMatch(db, {
      jobId,
      candidateId,
      score: 50,
      engineVersion: '0.0.0',
      embeddingModelRevision: 'rev1',
      computedAt: new Date().toISOString(),
    });
    const second = upsertMatch(db, {
      jobId,
      candidateId,
      score: 91,
      engineVersion: '0.0.1',
      embeddingModelRevision: 'rev2',
      computedAt: new Date().toISOString(),
    });

    expect(second.id).toBe(first.id);
    expect(second.score).toBe(91);
    expect(second.engineVersion).toBe('0.0.1');

    const count = (db.prepare('SELECT COUNT(*) as c FROM matches').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('getMatch returns null when no match exists for the pair', () => {
    expect(getMatch(db, jobId, candidateId)).toBeNull();
  });

  it('getMatch finds an upserted match by (jobId, candidateId)', () => {
    upsertMatch(db, {
      jobId,
      candidateId,
      score: 70,
      engineVersion: '0.0.0',
      embeddingModelRevision: 'rev1',
      computedAt: new Date().toISOString(),
    });
    const found = getMatch(db, jobId, candidateId);
    expect(found?.score).toBe(70);
  });

  it('rejects a match referencing a nonexistent job (real FK enforcement)', () => {
    expect(() =>
      upsertMatch(db, {
        jobId: 'nonexistent',
        candidateId,
        score: 1,
        engineVersion: null,
        embeddingModelRevision: null,
        computedAt: null,
      }),
    ).toThrow(/FOREIGN KEY/);
  });

  it('listMatchesForJob returns only matches for that job', () => {
    const otherCandidate = createOrGetCandidate(db, filesDir, {
      fileBytes: Buffer.from('other candidate bytes'),
      originalFilename: 'other.pdf',
      rawText: 'other text',
      parseStatus: 'ok',
      parseConfidence: 0.9,
      warnings: [],
      language: 'en',
    }).candidate.id;

    upsertMatch(db, {
      jobId,
      candidateId,
      score: 60,
      engineVersion: null,
      embeddingModelRevision: null,
      computedAt: null,
    });
    upsertMatch(db, {
      jobId,
      candidateId: otherCandidate,
      score: 80,
      engineVersion: null,
      embeddingModelRevision: null,
      computedAt: null,
    });

    const matches = listMatchesForJob(db, jobId);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.score).sort()).toEqual([60, 80]);
  });
});
