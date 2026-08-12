#!/usr/bin/env node
/**
 * Section 0.2.2: no skipped, `.only`-ed or todo tests. Ever.
 *
 * A syntactic ESLint ban is not enough — Phase 0 verification defeated one with
 * `const d = describe; d.only(...)` and with runtime `ctx.skip()`, both
 * ESLint-clean, both silently skipping tests that contained a deliberately
 * failing assertion while every hook reported success.
 *
 * This reads the RESULT of the run, so aliasing and computed access cannot
 * evade it. The report is deleted before each run (see pretest-clean.mjs), so a
 * missing report means the run did not produce one and this exits 2 rather than
 * validating a stale file from a previous run.
 *
 * Exit codes: 0 every test ran · 1 real violation · 2 the check could not be
 * trusted. Never a silent pass.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeTestReport } from './lib/analyze-test-report.mjs';

const REPORT = new URL('../coverage/test-results.json', import.meta.url);
const FLOOR = new URL('./test-floor.json', import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Directories whose contents, if newer than the report, make it stale. */
const WATCHED = ['packages', 'apps', 'scripts'];
const WATCHED_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

/**
 * Newest modification time across all source and test files.
 *
 * Deleting the report before a run only protects the sanctioned scripts. Phase 0
 * verification bypassed that by invoking vitest directly with a reporter
 * override, so no fresh JSON was written and the guard validated the PREVIOUS
 * run — certifying 30 passing tests while the actual run skipped a failing one.
 *
 * Comparing against source mtimes closes it: if anything has been edited since
 * the report was produced, the report cannot describe the current tree.
 *
 * @returns {{ mtimeMs: number, file: string }}
 */
function newestSource() {
  let newest = { mtimeMs: 0, file: '(none)' };
  for (const dir of WATCHED) {
    /** @type {string} */
    const base = join(ROOT, dir);
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = readdirSync(base, { withFileTypes: true, recursive: true });
    } catch {
      continue; // Directory absent (e.g. apps/ before Phase 6) — not an error.
    }
    for (const entry of entries) {
      if (!entry.isFile() || !WATCHED_EXT.test(entry.name)) continue;
      const full = join(entry.parentPath, entry.name);
      if (full.includes('node_modules') || full.includes(`${'dist'}/`)) continue;
      const { mtimeMs } = statSync(full);
      if (mtimeMs > newest.mtimeMs) newest = { mtimeMs, file: full };
    }
  }
  return newest;
}

/**
 * @param {URL} url
 * @param {string} label
 * @returns {unknown}
 */
function readJson(url, label) {
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`❌ Could not read ${label}.`);
    console.error(`   ${detail}`);
    if (label === 'the test report') {
      console.error('   The report is deleted before every run, so a missing file means the');
      console.error('   test run did not write one. Refusing to report success.');
    }
    process.exit(2);
  }
}

const report = readJson(REPORT, 'the test report');

// Staleness gate, before anything else is trusted.
const reportMtime = statSync(REPORT).mtimeMs;
const newest = newestSource();
if (newest.mtimeMs > reportMtime) {
  console.error('❌ The test report is stale — source has changed since it was written.');
  console.error(`   Newest source: ${newest.file.replace(ROOT, './')}`);
  console.error(
    `   Report is ${String(Math.round((newest.mtimeMs - reportMtime) / 1000))}s older than it.`,
  );
  console.error('   Run `pnpm test` (which regenerates the report) rather than vitest directly.');
  process.exit(2);
}

const floorConfig = readJson(FLOOR, 'scripts/test-floor.json');

const floor =
  typeof floorConfig === 'object' && floorConfig !== null
    ? /** @type {Record<string, unknown>} */ (floorConfig)['minTests']
    : undefined;
if (typeof floor !== 'number' || !Number.isInteger(floor) || floor < 0) {
  console.error('❌ scripts/test-floor.json: minTests must be a non-negative integer.');
  process.exit(2);
}

const { code, messages, total } = analyzeTestReport(report, { floor });

if (code === 2) {
  console.error('❌ Test report could not be trusted:');
  for (const m of messages) console.error(`   ${m}`);
  process.exit(2);
}

if (code === 1) {
  console.error('\n❌ Test integrity check failed:\n');
  for (const m of messages) console.error(m);
  console.error('\nSection 0.2.2: fix the test or fix the code, then record it in HONESTY_LOG.md.');
  process.exit(1);
}

console.log(
  `✅ All ${String(total)} tests executed — none skipped, todo, or .only-ed (floor: ${String(floor)}).`,
);
