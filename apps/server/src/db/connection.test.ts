import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from './connection.js';

describe('openDatabase', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-conn-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('creates the data dir, the db file and the files dir, and applies migrations', () => {
    const db = openDatabase({ dataDir });
    try {
      expect(existsSync(path.join(dataDir, 'matchdesk.db'))).toBe(true);
      expect(existsSync(path.join(dataDir, 'files'))).toBe(true);

      const tableNames = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(tableNames).toContain('candidates');
    } finally {
      db.close();
    }
  });

  it('enables WAL journal mode', () => {
    const db = openDatabase({ dataDir });
    try {
      const mode = (db.pragma('journal_mode', { simple: true }) as string).toLowerCase();
      expect(mode).toBe('wal');
    } finally {
      db.close();
    }
  });

  it('enables foreign key enforcement', () => {
    const db = openDatabase({ dataDir });
    try {
      const fk = db.pragma('foreign_keys', { simple: true });
      expect(fk).toBe(1);
    } finally {
      db.close();
    }
  });

  it('enforces foreign keys for real: inserting a job_requirement for a missing job fails', () => {
    const db = openDatabase({ dataDir });
    try {
      const now = new Date().toISOString();
      expect(() =>
        db
          .prepare(
            `INSERT INTO job_requirements (id, job_id, label, is_hard_requirement, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run('req_1', 'nonexistent_job', 'Python', 0, now, now),
      ).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      db.close();
    }
  });
});
