#!/usr/bin/env node
/**
 * Writes the fixture corpus to `fixtures/generated/` as real PDF and DOCX
 * files, so a human can open one in a viewer and see what the engine sees.
 *
 * **Not used by the test suite.** Both tiers generate their bytes in memory —
 * a test that read from disk would pass or fail depending on whether someone
 * had run this script, which is a worse property than it sounds. This exists
 * for inspection only, and `fixtures/generated/` is gitignored: the binaries
 * are derived, and committing them would reintroduce exactly the
 * unreviewable-artifact problem ADR-026 generates them to avoid.
 *
 * Output is byte-identical on every run (see `lib/fixture-docs.mjs`), so
 * re-running never produces a spurious diff.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CORPUS, REFUSAL_CORPUS } from '../fixtures/corpus/definitions.mjs';
import { buildFixtureDocx, buildFixturePdf } from './lib/fixture-docs.mjs';

const outDir = fileURLToPath(new URL('../fixtures/generated/', import.meta.url));
mkdirSync(outDir, { recursive: true });

let written = 0;
let skipped = 0;

for (const entry of [...CORPUS, ...REFUSAL_CORPUS]) {
  const unrenderable = 'pdfUnrenderable' in entry ? entry.pdfUnrenderable : undefined;

  if (unrenderable === undefined) {
    writeFileSync(path.join(outDir, `${entry.id}.pdf`), await buildFixturePdf(entry));
    written++;
  } else {
    // Named, never silent. A fixture missing from the output directory with no
    // explanation is indistinguishable from one nobody noticed was missing.
    console.log(`  skip PDF  ${entry.id} — ${unrenderable}`);
    skipped++;
  }

  writeFileSync(path.join(outDir, `${entry.id}.docx`), await buildFixtureDocx(entry));
  written++;
}

console.log(`\nWrote ${String(written)} file(s) to fixtures/generated/`);
if (skipped > 0) {
  console.log(`${String(skipped)} PDF(s) skipped — see H-067 (WinAnsi encoding limit).`);
}
