import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type Database from 'better-sqlite3';

/**
 * Forward-only migrations only (ADR-010 / Section 4: no down-migrations).
 * Migration files are plain `.sql`, live in the repo-root `migrations/`
 * directory, and are applied in filename order — zero-padded numeric
 * prefixes (`0001_...`, `0002_...`) make lexicographic sort equal numeric
 * order.
 *
 * Resolved relative to this module's own compiled location so it works the
 * same whether run from `src/db/migrate.ts` (via vitest) or
 * `dist/db/migrate.js` (via `tsc --build`): both mirror
 * `apps/server/<src|dist>/db/`, four directories below the repo root.
 */
export function getDefaultMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../../migrations');
}

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );
}

/**
 * Applies every not-yet-applied `.sql` file in `migrationsDir`, in filename
 * order, tracking each in `schema_migrations`. Safe to call repeatedly —
 * already-applied migrations are skipped.
 *
 * Each migration runs inside its own transaction: either the whole file's
 * DDL applies and its version is recorded, or neither happens.
 */
export function applyMigrations(db: Database.Database, migrationsDir: string): void {
  ensureMigrationsTable(db);

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  const isApplied = db.prepare<[string], { version: string }>(
    'SELECT version FROM schema_migrations WHERE version = ?',
  );
  const recordApplied = db.prepare<[string, string]>(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
  );

  for (const file of files) {
    if (isApplied.get(file) !== undefined) {
      continue;
    }

    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    const applyOne = db.transaction(() => {
      db.exec(sql);
      recordApplied.run(file, new Date().toISOString());
    });
    applyOne();
  }
}
