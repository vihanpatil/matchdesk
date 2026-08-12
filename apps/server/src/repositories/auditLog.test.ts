import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../db/connection.js';
import { appendAuditLog, listAuditLogForEntity } from './auditLog.js';

import type Database from 'better-sqlite3';

describe('audit log repository', () => {
  let dataDir: string;
  let db: Database.Database;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-audit-repo-'));
    db = openDatabase({ dataDir });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('appends an entry and reads it back', () => {
    const entry = appendAuditLog(db, {
      entityType: 'candidate',
      entityId: 'cand_1',
      action: 'created',
      details: JSON.stringify({ filename: 'resume.pdf' }),
    });

    expect(entry.entityType).toBe('candidate');
    expect(entry.entityId).toBe('cand_1');
    expect(entry.action).toBe('created');
    expect(entry.details).toBe(JSON.stringify({ filename: 'resume.pdf' }));
  });

  it('allows null details', () => {
    const entry = appendAuditLog(db, {
      entityType: 'job',
      entityId: 'job_1',
      action: 'viewed',
      details: null,
    });
    expect(entry.details).toBeNull();
  });

  it('listAuditLogForEntity returns entries for that entity only, oldest first', () => {
    appendAuditLog(db, {
      entityType: 'candidate',
      entityId: 'cand_1',
      action: 'created',
      details: null,
    });
    appendAuditLog(db, {
      entityType: 'candidate',
      entityId: 'cand_1',
      action: 'viewed',
      details: null,
    });
    appendAuditLog(db, {
      entityType: 'candidate',
      entityId: 'cand_2',
      action: 'created',
      details: null,
    });

    const entries = listAuditLogForEntity(db, 'candidate', 'cand_1');
    expect(entries.map((e) => e.action)).toEqual(['created', 'viewed']);
  });

  it('repository writes go through the same append-only table as raw SQL, so UPDATE still aborts', () => {
    appendAuditLog(db, {
      entityType: 'candidate',
      entityId: 'cand_1',
      action: 'created',
      details: null,
    });

    expect.assertions(1);
    try {
      db.prepare("UPDATE audit_log SET action = 'tampered' WHERE entity_id = 'cand_1'").run();
    } catch (error: unknown) {
      expect((error as Error).message).toBe('audit_log is append-only: UPDATE is not permitted');
    }
  });
});
