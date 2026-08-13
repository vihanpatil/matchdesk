#!/usr/bin/env node
/**
 * Regenerates scripts/test-manifest.json from the most recent run.
 *
 * Deliberately a separate, explicit command. Removing a test is legitimate
 * sometimes — but it must be a visible line in a diff a reviewer can question,
 * not something that happens silently because a count stayed the same.
 *
 * Usage: pnpm test && pnpm test:manifest
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { collectTestIds } from './lib/analyze-test-report.mjs';

const REPORT = new URL('../coverage/test-results.json', import.meta.url);
const MANIFEST = new URL('./test-manifest.json', import.meta.url);
const FLOOR = new URL('./test-floor.json', import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const allowShrink = process.argv.includes('--allow-shrink');

/** @type {unknown} */
let report;
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`❌ Could not read the test report: ${detail}`);
  console.error('   Run `pnpm test` first.');
  process.exit(2);
}

const tests = collectTestIds(report, ROOT);
if (tests.length === 0) {
  console.error('❌ The report contains no tests. Refusing to write an empty manifest.');
  process.exit(2);
}

/*
 * Refuse a manifest smaller than the committed floor.
 *
 * Why this guard exists (HONESTY_LOG H-042): the report is simply "the last
 * run", so running `vitest run path/to/one.test.ts` and then `pnpm
 * test:manifest` rewrites the manifest from THAT run. The manifest went 493
 * identities -> 13 in exactly that way, and every gate stayed green: the
 * identity check only verifies that manifest entries still exist, so a
 * 13-entry manifest passes trivially, and the count floor passes because 493
 * actual tests still ran. The gate would have kept reporting success while
 * checking 2.6% of what it was built to check.
 *
 * The floor is the right reference because the project already maintains it
 * as "tests that must run", and lowering it already requires a HONESTY_LOG
 * entry — so a genuine, deliberate reduction has a documented path and an
 * accidental truncation does not.
 */
let floor = 0;
try {
  const floorConfig = JSON.parse(readFileSync(FLOOR, 'utf8'));
  const value = floorConfig?.minTests;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) floor = value;
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`❌ Could not read scripts/test-floor.json: ${detail}`);
  process.exit(2);
}

if (tests.length < floor && !allowShrink) {
  console.error(
    `❌ Refusing to write a manifest of ${String(tests.length)} identities when the ` +
      `committed floor is ${String(floor)}.`,
  );
  console.error('');
  console.error('   The report is whatever ran LAST. This almost always means the manifest was');
  console.error('   about to be regenerated from a FILTERED run (a single file or -t pattern),');
  console.error('   which silently shrinks the identity gate to whatever that run happened to');
  console.error('   cover — and every check would still pass. See HONESTY_LOG.md H-042.');
  console.error('');
  console.error('   Run the FULL suite first:  pnpm test');
  console.error('   Genuinely removing tests?  lower minTests in scripts/test-floor.json, say');
  console.error('                              why in HONESTY_LOG.md, then re-run this.');
  console.error('   Deliberate shrink anyway:  pnpm test:manifest --allow-shrink');
  process.exit(2);
}

if (tests.length < floor) {
  console.warn(
    `⚠ --allow-shrink: writing ${String(tests.length)} identities, below the floor of ` +
      `${String(floor)}. This weakens the identity gate — it needs a HONESTY_LOG.md entry.`,
  );
}

const body = {
  $comment:
    'Authoritative list of test identities that must continue to exist. A count can be padded with filler tests to mask a deletion; identities cannot. Regenerate with `pnpm test:manifest` and explain any removals in HONESTY_LOG.md.',
  tests,
};

writeFileSync(MANIFEST, `${JSON.stringify(body, null, 2)}\n`);
console.log(`✅ Wrote ${String(tests.length)} test identities to scripts/test-manifest.json`);
