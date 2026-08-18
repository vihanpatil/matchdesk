import { mkdirSync } from 'node:fs';

import Database from 'better-sqlite3';

import { applyMigrations, getDefaultMigrationsDir } from './migrate.js';
import { getDataDir, getDbPath, getFilesDir } from './paths.js';

export interface OpenDatabaseOptions {
  /** Overrides the resolved data dir (tests: always pass a temp dir here). */
  dataDir?: string;
  /** Overrides where migration `.sql` files are read from. */
  migrationsDir?: string;
}

/**
 * Opens (creating on first run) the recruiter's SQLite database at
 * `<dataDir>/matchdesk.db`, ensures the sidecar `files/` directory exists
 * (ADR-008), sets the required pragmas, and brings the schema up to head.
 */
export function openDatabase(options: OpenDatabaseOptions = {}): Database.Database {
  const dataDir = options.dataDir ?? getDataDir();
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(getFilesDir(dataDir), { recursive: true });

  const db = new Database(getDbPath(dataDir));

  // WAL: readers do not block the writer, which matters once matrix-fill
  // background jobs (H-008) run concurrently with the UI reading progress.
  db.pragma('journal_mode = WAL');
  // Off by default in SQLite for backward compatibility; required for the
  // audit_log append-only guarantee to compose with FK cascades correctly,
  // and for referential integrity generally (Section 4).
  db.pragma('foreign_keys = ON');
  // D7 (ADR-018 Decision 4): without this, `INSERT OR REPLACE` rewrites a
  // committed audit row — REPLACE's conflict resolution deletes the old row
  // WITHOUT firing the audit_log BEFORE DELETE trigger. With it, the delete
  // fires the trigger and the statement aborts, closing the last statement
  // form that could alter history. The only triggers in this schema are the
  // two audit_log guards, and audit_log carries no foreign keys, so no
  // cascade path changes behaviour under this pragma.
  db.pragma('recursive_triggers = ON');

  applyMigrations(db, options.migrationsDir ?? getDefaultMigrationsDir());

  return db;
}
