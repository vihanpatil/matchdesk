#!/usr/bin/env node
/**
 * Clears the previous run's artifacts before tests start.
 *
 * Without this, assert-no-skipped-tests.mjs can validate a stale report.
 * Phase 0 verification demonstrated exactly that: overriding the reporter
 * (`vitest run --reporter=dot`) meant the JSON was never rewritten, so the
 * guard re-read the previous run's file and certified "All 30 tests executed"
 * while the actual run had skipped a failing test.
 *
 * Removing both the report and the run marker means any run that does not
 * write a fresh report leaves the guard with nothing to validate, and it exits
 * 2 rather than passing.
 */

import { rmSync } from 'node:fs';

for (const name of ['test-results.json', '.run-marker']) {
  rmSync(new URL(`../coverage/${name}`, import.meta.url), { force: true });
}
