import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vitest globalSetup: stamps a marker at run START.
 *
 * The report is written at run END. So for any run that genuinely produced the
 * report on disk, `marker.mtime <= report.mtime`. If a later run starts without
 * writing a report — which is exactly what a reporter override does — the
 * marker becomes NEWER than the report, and the guard can see that the report
 * does not describe the most recent run.
 *
 * This replaces inferring freshness from source-file mtimes, which Phase 0
 * verification defeated three ways: untracked config files, backdating a
 * source file, and touching the report forward. Marker ordering depends on
 * the run itself rather than on timestamps an author can set.
 */
const MARKER = fileURLToPath(new URL('../coverage/.run-marker', import.meta.url));

export default function setup() {
  mkdirSync(dirname(MARKER), { recursive: true });
  writeFileSync(MARKER, `run started\n`);
}
