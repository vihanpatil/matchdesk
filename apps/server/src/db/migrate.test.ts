import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations, getDefaultMigrationsDir } from './migrate.js';

describe('applyMigrations', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-migrate-'));
    db = new Database(path.join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies the repo migrations in order against a real SQLite file and creates every table', () => {
    applyMigrations(db, getDefaultMigrationsDir());

    const tableNames = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    for (const expected of [
      'jobs',
      'job_requirements',
      'candidates',
      'matches',
      'audit_log',
      'schema_migrations',
    ]) {
      expect(tableNames).toContain(expected);
    }
  });

  it('0003 removes candidate_attributes and adds matches.reference_date (ADR-024)', () => {
    applyMigrations(db, getDefaultMigrationsDir());

    const tableNames = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    // Derived attributes are no longer persisted at all — there is no second
    // copy of the evidence to go stale against the score (H-052).
    expect(tableNames).not.toContain('candidate_attributes');

    const matchColumns = db
      .prepare('PRAGMA table_info(matches)')
      .all()
      .map((row) => (row as { name: string }).name);
    // The third input to extraction, recorded next to the number it produced,
    // so a stored score is reproducible from stored state alone.
    expect(matchColumns).toContain('reference_date');
    expect(matchColumns).toContain('engine_version');
  });

  it('records every applied migration filename in schema_migrations', () => {
    applyMigrations(db, getDefaultMigrationsDir());

    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => (row as { version: string }).version);

    expect(versions).toEqual([
      '0001_core_tables.sql',
      '0002_audit_log.sql',
      '0003_derive_attributes_on_demand.sql',
      '0004_job_scoring_configs.sql',
    ]);
  });

  it('is idempotent: applying twice does not re-run or error', () => {
    applyMigrations(db, getDefaultMigrationsDir());
    expect(() => {
      applyMigrations(db, getDefaultMigrationsDir());
    }).not.toThrow();

    const count = (db.prepare('SELECT COUNT(*) as c FROM schema_migrations').get() as { c: number })
      .c;
    expect(count).toBe(4);
  });

  it('applies migrations from an arbitrary directory in filename order, tracked by version', () => {
    const migDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-migsrc-'));
    try {
      writeFileSync(path.join(migDir, '0001_a.sql'), 'CREATE TABLE a (id TEXT PRIMARY KEY);');
      writeFileSync(
        path.join(migDir, '0002_b.sql'),
        'CREATE TABLE b (id TEXT PRIMARY KEY, a_id TEXT REFERENCES a(id));',
      );

      applyMigrations(db, migDir);

      const tableNames = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(tableNames).toEqual(expect.arrayContaining(['a', 'b']));
    } finally {
      rmSync(migDir, { recursive: true, force: true });
    }
  });
});
