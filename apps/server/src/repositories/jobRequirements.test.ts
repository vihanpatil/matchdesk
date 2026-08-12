import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../db/connection.js';
import { createJob } from './jobs.js';
import { addJobRequirement, listJobRequirements } from './jobRequirements.js';

import type Database from 'better-sqlite3';

describe('job requirements repository', () => {
  let dataDir: string;
  let db: Database.Database;
  let filesDir: string;
  let jobId: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-reqs-repo-'));
    db = openDatabase({ dataDir });
    filesDir = path.join(dataDir, 'files');
    const job = createJob(db, filesDir, {
      title: 'Backend Engineer',
      fileBytes: Buffer.from('job bytes'),
      originalFilename: 'job.pdf',
      rawText: 'requires 5 years Python',
      parseStatus: 'ok',
      parseConfidence: 0.9,
      warnings: [],
      language: 'en',
    });
    jobId = job.id;
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('adds a requirement with evidence offsets and reads it back', () => {
    const req = addJobRequirement(db, {
      jobId,
      label: '5+ years Python',
      isHardRequirement: true,
      evidenceStart: 12,
      evidenceEnd: 30,
    });

    expect(req.jobId).toBe(jobId);
    expect(req.isHardRequirement).toBe(true);
    expect(req.evidenceStart).toBe(12);
    expect(req.evidenceEnd).toBe(30);
  });

  it('allows null evidence offsets for a requirement not anchored to a span', () => {
    const req = addJobRequirement(db, {
      jobId,
      label: 'Team player',
      isHardRequirement: false,
      evidenceStart: null,
      evidenceEnd: null,
    });
    expect(req.evidenceStart).toBeNull();
    expect(req.evidenceEnd).toBeNull();
  });

  it('rejects a mismatched evidence pair (one null, one set) at the boundary', () => {
    expect(() =>
      addJobRequirement(db, {
        jobId,
        label: 'bad span',
        isHardRequirement: false,
        evidenceStart: 5,
        evidenceEnd: null,
      }),
    ).toThrow();
  });

  it('rejects evidenceStart > evidenceEnd at the boundary', () => {
    expect(() =>
      addJobRequirement(db, {
        jobId,
        label: 'inverted span',
        isHardRequirement: false,
        evidenceStart: 30,
        evidenceEnd: 10,
      }),
    ).toThrow();
  });

  it('rejects a requirement for a job that does not exist (real FK enforcement)', () => {
    expect(() =>
      addJobRequirement(db, {
        jobId: 'nonexistent_job',
        label: 'x',
        isHardRequirement: false,
        evidenceStart: null,
        evidenceEnd: null,
      }),
    ).toThrow(/FOREIGN KEY/);
  });

  it('listJobRequirements returns only requirements for the given job, in creation order', () => {
    addJobRequirement(db, {
      jobId,
      label: 'first',
      isHardRequirement: false,
      evidenceStart: null,
      evidenceEnd: null,
    });
    addJobRequirement(db, {
      jobId,
      label: 'second',
      isHardRequirement: false,
      evidenceStart: null,
      evidenceEnd: null,
    });

    const other = createJob(db, filesDir, {
      title: 'Other job',
      fileBytes: Buffer.from('other job bytes'),
      originalFilename: 'other.pdf',
      rawText: 'unrelated',
      parseStatus: 'ok',
      parseConfidence: 0.9,
      warnings: [],
      language: 'en',
    });
    addJobRequirement(db, {
      jobId: other.id,
      label: 'unrelated requirement',
      isHardRequirement: false,
      evidenceStart: null,
      evidenceEnd: null,
    });

    const reqs = listJobRequirements(db, jobId);
    expect(reqs.map((r) => r.label)).toEqual(['first', 'second']);
  });
});
