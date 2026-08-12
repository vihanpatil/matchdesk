#!/usr/bin/env node
/**
 * Deletes the previous run's JSON report before tests start.
 *
 * Without this, assert-no-skipped-tests.mjs can validate a stale report.
 * Phase 0 verification demonstrated exactly that: overriding the reporter
 * (`vitest run --reporter=dot`) meant the JSON was never rewritten, so the
 * guard re-read the previous run's file and certified "All 20 tests executed"
 * while the actual run had skipped a failing test.
 *
 * With the file removed up front, any run that does not write a fresh report
 * leaves nothing behind, and the guard exits 2 instead of passing.
 */

import { rmSync } from 'node:fs';

rmSync(new URL('../coverage/test-results.json', import.meta.url), { force: true });
