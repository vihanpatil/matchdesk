import type Database from 'better-sqlite3';

import { generateId } from '../ids/generateId.js';

import {
  AppendAuditLogInputSchema,
  AuditLogEntrySchema,
  type AppendAuditLogInput,
  type AuditLogEntry,
} from './types.js';

interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  details: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: AuditLogRow): AuditLogEntry {
  return AuditLogEntrySchema.parse({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * Appends an entry to the append-only audit_log (ADR-010 Phase 1 gate).
 * There is deliberately no `updateAuditLog` / `deleteAuditLog` export —
 * the SQL triggers in migrations/0002_audit_log.sql back this even against
 * a caller that reaches for raw SQL directly.
 */
export function appendAuditLog(db: Database.Database, input: AppendAuditLogInput): AuditLogEntry {
  const parsed = AppendAuditLogInputSchema.parse(input);
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO audit_log (id, entity_type, entity_id, action, details, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, parsed.entityType, parsed.entityId, parsed.action, parsed.details, now, now);

  const row = db.prepare<[string], AuditLogRow>('SELECT * FROM audit_log WHERE id = ?').get(id);
  if (row === undefined) {
    throw new Error(
      `appendAuditLog: insert of ${id} succeeded but the row was not found on read-back`,
    );
  }
  return mapRow(row);
}

export function listAuditLogForEntity(
  db: Database.Database,
  entityType: string,
  entityId: string,
): AuditLogEntry[] {
  const rows = db
    .prepare<[string, string], AuditLogRow>(
      'SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC, id ASC',
    )
    .all(entityType, entityId);
  return rows.map(mapRow);
}
