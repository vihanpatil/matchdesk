import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from './connection.js';

import type Database from 'better-sqlite3';

describe('audit_log is append-only (ADR-010 Phase 1 gate)', () => {
  let dataDir: string;
  let db: Database.Database;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-audit-'));
    db = openDatabase({ dataDir });
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO audit_log (id, entity_type, entity_id, action, details, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('audit_1', 'candidate', 'cand_1', 'created', null, now, now);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('rejects UPDATE with the exact abort message from the trigger', () => {
    expect.assertions(2);
    try {
      db.prepare("UPDATE audit_log SET action = 'tampered' WHERE id = ?").run('audit_1');
    } catch (error: unknown) {
      // Assert exact equality, not merely "an error was thrown" (a test
      // asserting only "UPDATE throws" would also pass on a broken trigger
      // that used double-quoted RAISE(ABORT, "...") and failed with
      // "no such column" instead of the intended message).
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('audit_log is append-only: UPDATE is not permitted');
    }
  });

  it('rejects an UPDATE that only touches updated_at, with the same exact message', () => {
    expect.assertions(1);
    try {
      db.prepare('UPDATE audit_log SET updated_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        'audit_1',
      );
    } catch (error: unknown) {
      expect((error as Error).message).toBe('audit_log is append-only: UPDATE is not permitted');
    }
  });

  it('rejects DELETE with the exact abort message from the trigger', () => {
    expect.assertions(1);
    try {
      db.prepare('DELETE FROM audit_log WHERE id = ?').run('audit_1');
    } catch (error: unknown) {
      expect((error as Error).message).toBe('audit_log is append-only: DELETE is not permitted');
    }
  });

  it('leaves the row completely unchanged after a rejected UPDATE', () => {
    expect(() =>
      db.prepare("UPDATE audit_log SET action = 'tampered' WHERE id = ?").run('audit_1'),
    ).toThrow();

    const row = db.prepare('SELECT action FROM audit_log WHERE id = ?').get('audit_1') as {
      action: string;
    };
    expect(row.action).toBe('created');
  });

  it('still permits INSERT (append)', () => {
    const now = new Date().toISOString();
    expect(() =>
      db
        .prepare(
          `INSERT INTO audit_log (id, entity_type, entity_id, action, details, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('audit_2', 'candidate', 'cand_1', 'viewed', null, now, now),
    ).not.toThrow();

    const count = (db.prepare('SELECT COUNT(*) as c FROM audit_log').get() as { c: number }).c;
    expect(count).toBe(2);
  });
});
