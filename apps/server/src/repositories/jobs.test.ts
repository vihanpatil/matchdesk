import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../db/connection.js';
import { sha256Hex } from '../fileStore/contentStore.js';

import { createJob, getJobById, listJobs } from './jobs.js';

import type Database from 'better-sqlite3';

describe('jobs repository', () => {
  let dataDir: string;
  let db: Database.Database;
  let filesDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-job-repo-'));
    db = openDatabase({ dataDir });
    filesDir = path.join(dataDir, 'files');
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const baseInput = (bytes: Buffer) => ({
    title: 'Senior Backend Engineer',
    fileBytes: bytes,
    originalFilename: 'job.pdf',
    rawText: 'We are looking for a senior backend engineer...',
    parseStatus: 'ok' as const,
    parseConfidence: 0.9,
    warnings: [],
    language: 'en',
  });

  it('creates a job and stores the original bytes on disk by hash', () => {
    const bytes = Buffer.from('job description pdf bytes');
    const job = createJob(db, filesDir, baseInput(bytes));

    expect(job.title).toBe('Senior Backend Engineer');
    expect(job.fileSha256).toBe(sha256Hex(bytes));
    expect(existsSync(path.join(filesDir, job.fileSha256))).toBe(true);
  });

  it('two jobs uploaded from identical bytes are two distinct rows (jobs are not deduped like candidates)', () => {
    const bytes = Buffer.from('same job posting text, reposted');
    const a = createJob(db, filesDir, baseInput(bytes));
    const b = createJob(db, filesDir, baseInput(bytes));

    expect(a.id).not.toBe(b.id);
    const count = (db.prepare('SELECT COUNT(*) as c FROM jobs').get() as { c: number }).c;
    expect(count).toBe(2);
  });

  it('getJobById returns null for a missing id', () => {
    expect(getJobById(db, 'missing')).toBeNull();
  });

  it('getJobById round-trips a created job', () => {
    const job = createJob(db, filesDir, baseInput(Buffer.from('roundtrip')));
    expect(getJobById(db, job.id)).toEqual(job);
  });

  it('listJobs returns every job in creation order', () => {
    createJob(db, filesDir, { ...baseInput(Buffer.from('a')), title: 'Job A' });
    createJob(db, filesDir, { ...baseInput(Buffer.from('b')), title: 'Job B' });

    const jobs = listJobs(db);
    expect(jobs.map((j) => j.title)).toEqual(['Job A', 'Job B']);
  });
});
