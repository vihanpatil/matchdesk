import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Recruiter data lives outside the repository entirely (ADR-012): the SQLite
 * file and the content-addressed `files/` directory (ADR-008) both live
 * under this directory.
 *
 * Default: `~/.matchdesk`, resolved from the OS home directory. Overridable
 * via `MATCHDESK_DATA_DIR` — tests MUST set this to a temp directory and
 * must never touch the real home directory.
 */
export function getDataDir(): string {
  const override = process.env['MATCHDESK_DATA_DIR'];
  if (override !== undefined && override.trim().length > 0) {
    return path.resolve(override);
  }
  return path.join(homedir(), '.matchdesk');
}

/** Path to the SQLite database file within the given (or default) data dir. */
export function getDbPath(dataDir: string = getDataDir()): string {
  return path.join(dataDir, 'matchdesk.db');
}

/**
 * Path to the content-addressed original-file store (ADR-008) within the
 * given (or default) data dir.
 */
export function getFilesDir(dataDir: string = getDataDir()): string {
  return path.join(dataDir, 'files');
}
