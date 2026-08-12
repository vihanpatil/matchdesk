#!/usr/bin/env node
/**
 * Section 0.2.2: no skipped, `.only`-ed or todo tests. Ever. And no test may
 * silently cease to exist.
 *
 * A syntactic ESLint ban is not enough — Phase 0 verification defeated one with
 * `const d = describe; d.only(...)` and with runtime `ctx.skip()`, both
 * ESLint-clean, both silently skipping tests that contained a deliberately
 * failing assertion while every hook reported success.
 *
 * Three independent checks, in order, each fail-CLOSED:
 *
 *   1. FRESHNESS — the run marker (written at run start) must not be newer than
 *      the report (written at run end). A run that produced no report is
 *      therefore detectable, which is what a reporter override does.
 *   2. INTEGRITY — no test may report a status other than passed/failed.
 *   3. IDENTITY  — every test in the committed manifest must still exist. A
 *      count can be padded with filler tests to hide a deletion; identities
 *      cannot.
 *
 * Exit codes: 0 clean · 1 real violation · 2 the check could not be trusted.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';

import { analyzeTestReport } from './lib/analyze-test-report.mjs';

const REPORT = new URL('../coverage/test-results.json', import.meta.url);
const MARKER = new URL('../coverage/.run-marker', import.meta.url);
const FLOOR = new URL('./test-floor.json', import.meta.url);
const MANIFEST = new URL('./test-manifest.json', import.meta.url);

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

/* ---- 1. Freshness ---- */
if (!existsSync(MARKER)) {
  console.error('❌ No run marker — the test run did not start through the sanctioned path.');
  console.error('   Run `pnpm test` or `pnpm test:cov`, not vitest directly.');
  process.exit(2);
}
if (!existsSync(REPORT)) {
  console.error('❌ A run started but wrote no report. Refusing to report success.');
  console.error('   This is what a reporter override looks like. Run `pnpm test`.');
  process.exit(2);
}
const markerAt = statSync(MARKER).mtimeMs;
const reportAt = statSync(REPORT).mtimeMs;
if (markerAt > reportAt) {
  console.error('❌ The test report is stale.');
  console.error('   A run started after this report was written but produced no new report,');
  console.error(
    `   so the report describes an earlier run (marker is ${String(Math.round((markerAt - reportAt) / 1000))}s newer).`,
  );
  console.error('   Run `pnpm test` rather than invoking vitest directly.');
  process.exit(2);
}

const report = readJson(REPORT, 'the test report');
const floorConfig = readJson(FLOOR, 'scripts/test-floor.json');
const manifestRaw = readJson(MANIFEST, 'scripts/test-manifest.json');

const floor =
  typeof floorConfig === 'object' && floorConfig !== null
    ? /** @type {Record<string, unknown>} */ (floorConfig)['minTests']
    : undefined;
if (typeof floor !== 'number' || !Number.isInteger(floor) || floor < 0) {
  console.error('❌ scripts/test-floor.json: minTests must be a non-negative integer.');
  process.exit(2);
}

const manifestTests =
  typeof manifestRaw === 'object' && manifestRaw !== null
    ? /** @type {Record<string, unknown>} */ (manifestRaw)['tests']
    : undefined;
if (!Array.isArray(manifestTests) || !manifestTests.every((t) => typeof t === 'string')) {
  console.error('❌ scripts/test-manifest.json: "tests" must be an array of strings.');
  process.exit(2);
}

/* ---- 2 + 3. Integrity and identity ---- */
const { code, messages, total } = analyzeTestReport(report, {
  floor,
  manifest: /** @type {string[]} */ (manifestTests),
});

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
  `✅ All ${String(total)} tests executed — none skipped, and all ${String(manifestTests.length)} manifest tests present.`,
);
