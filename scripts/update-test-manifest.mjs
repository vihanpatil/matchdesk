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
const ROOT = fileURLToPath(new URL('..', import.meta.url));

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

const body = {
  $comment:
    'Authoritative list of test identities that must continue to exist. A count can be padded with filler tests to mask a deletion; identities cannot. Regenerate with `pnpm test:manifest` and explain any removals in HONESTY_LOG.md.',
  tests,
};

writeFileSync(MANIFEST, `${JSON.stringify(body, null, 2)}\n`);
console.log(`✅ Wrote ${String(tests.length)} test identities to scripts/test-manifest.json`);
