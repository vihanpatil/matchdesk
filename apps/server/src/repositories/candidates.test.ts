import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../db/connection.js';
import { sha256Hex } from '../fileStore/contentStore.js';

import { createOrGetCandidate, getCandidateById, listCandidates } from './candidates.js';

import type Database from 'better-sqlite3';

describe('candidates repository', () => {
  let dataDir: string;
  let db: Database.Database;
  let filesDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-cand-repo-'));
    db = openDatabase({ dataDir });
    filesDir = path.join(dataDir, 'files');
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const baseInput = (bytes: Buffer, filename: string) => ({
    fileBytes: bytes,
    originalFilename: filename,
    rawText: `extracted text for ${filename}`,
    parseStatus: 'ok' as const,
    parseConfidence: 0.9,
    warnings: [],
    language: 'en',
  });

  it('creates a new candidate and stores the original bytes on disk by hash', () => {
    const bytes = Buffer.from('candidate one pdf bytes');
    const { candidate, alreadyExisted } = createOrGetCandidate(
      db,
      filesDir,
      baseInput(bytes, 'cand1.pdf'),
    );

    expect(alreadyExisted).toBe(false);
    expect(candidate.fileSha256).toBe(sha256Hex(bytes));
    expect(candidate.originalFilename).toBe('cand1.pdf');
    expect(existsSync(path.join(filesDir, candidate.fileSha256))).toBe(true);
    expect(readFileSync(path.join(filesDir, candidate.fileSha256))).toEqual(bytes);
  });

  it('dedups: re-uploading identical bytes returns the SAME row, flagged alreadyExisted, with the original created date', () => {
    const bytes = Buffer.from('identical resume bytes, uploaded twice');

    const first = createOrGetCandidate(db, filesDir, baseInput(bytes, 'first-name.pdf'));
    const second = createOrGetCandidate(db, filesDir, baseInput(bytes, 'renamed-on-reupload.pdf'));

    expect(second.alreadyExisted).toBe(true);
    expect(second.candidate.id).toBe(first.candidate.id);
    expect(second.candidate.createdAt).toBe(first.candidate.createdAt);
    // The original filename/metadata is preserved, not overwritten by the
    // re-upload's (possibly different) filename.
    expect(second.candidate.originalFilename).toBe('first-name.pdf');

    const rowCount = (db.prepare('SELECT COUNT(*) as c FROM candidates').get() as { c: number }).c;
    expect(rowCount).toBe(1);
  });

  it('different bytes with the same filename create two distinct candidates', () => {
    const a = createOrGetCandidate(db, filesDir, baseInput(Buffer.from('content A'), 'resume.pdf'));
    const b = createOrGetCandidate(db, filesDir, baseInput(Buffer.from('content B'), 'resume.pdf'));

    expect(a.candidate.id).not.toBe(b.candidate.id);
    expect(a.alreadyExisted).toBe(false);
    expect(b.alreadyExisted).toBe(false);
  });

  it('getCandidateById returns null for a missing id rather than throwing', () => {
    expect(getCandidateById(db, 'nonexistent')).toBeNull();
  });

  it('getCandidateById returns the stored candidate for a real id', () => {
    const { candidate } = createOrGetCandidate(
      db,
      filesDir,
      baseInput(Buffer.from('lookup me'), 'lookup.pdf'),
    );
    const found = getCandidateById(db, candidate.id);
    expect(found).toEqual(candidate);
  });

  it('persists parseStatus, warnings and language through a full round trip', () => {
    const { candidate } = createOrGetCandidate(db, filesDir, {
      fileBytes: Buffer.from('needs attention content'),
      originalFilename: 'sparse.pdf',
      rawText: 'Page 1 of 2',
      parseStatus: 'needs_attention',
      parseConfidence: 0.2,
      warnings: ['Low text density on 1 of 1 page(s) — likely a scanned/image PDF.'],
      language: null,
    });

    const found = getCandidateById(db, candidate.id);
    expect(found?.parseStatus).toBe('needs_attention');
    expect(found?.warnings).toEqual([
      'Low text density on 1 of 1 page(s) — likely a scanned/image PDF.',
    ]);
    expect(found?.language).toBeNull();
  });

  it('listCandidates returns every candidate, most recently created last', () => {
    createOrGetCandidate(db, filesDir, baseInput(Buffer.from('one'), 'one.pdf'));
    createOrGetCandidate(db, filesDir, baseInput(Buffer.from('two'), 'two.pdf'));

    const all = listCandidates(db);
    expect(all).toHaveLength(2);
    expect(all[0]?.originalFilename).toBe('one.pdf');
    expect(all[1]?.originalFilename).toBe('two.pdf');
  });

  it('rejects an empty fileBytes buffer at the boundary rather than storing a phantom file', () => {
    expect(() =>
      createOrGetCandidate(db, filesDir, baseInput(Buffer.alloc(0), 'empty.pdf')),
    ).toThrow();
  });
});
