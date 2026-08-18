#!/usr/bin/env node
/**
 * `pnpm gate` — reports ADR-023's exit criteria from evidence, not from a
 * reading of prose. See `scripts/lib/gate-registry.mjs` for the reasoning and
 * ADR-028 for the decision.
 *
 * E1 and E4 are deliberately NOT computed here. E1 is attested in
 * `docs/ATTACK_CHECKLIST.md`; E4 comes from Stryker, which takes ~22 min (measured 2026-08-17 at 1069 tests; it grows with the suite) and
 * has no business running inside a status command. Both print as "see <source>"
 * rather than being guessed at — a gate that reports a number it did not
 * measure is the H-025 failure this project keeps re-learning.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { computeGate, headingIds, validateRegistry } from './lib/gate-registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {{ findings: import('./lib/gate-registry.mjs').Finding[] }} */
const registry = JSON.parse(readFileSync(join(ROOT, 'docs/findings.json'), 'utf8'));
const logIds = headingIds(readFileSync(join(ROOT, 'HONESTY_LOG.md'), 'utf8'));

const problems = validateRegistry(registry.findings, logIds);
if (problems.length > 0) {
  console.error('\n✖ REGISTRY IS NOT SOUND — the gate cannot be computed:\n');
  for (const p of problems) console.error(`   ${p}`);
  console.error('');
  process.exit(1);
}

const gate = computeGate(registry.findings);

/**
 * @param {string} id
 * @param {boolean | null} ok
 * @param {string} detail
 */
const row = (id, ok, detail) =>
  `  ${id}  ${ok === null ? '  ??   ' : ok ? ' MET   ' : 'NOT MET'}  ${detail}`;

console.log('\nADR-023 exit criteria\n');
console.log(row('E1', null, 'see docs/ATTACK_CHECKLIST.md'));
console.log(
  row('E2', gate.e2, gate.e2 ? 'every open wrong-score finding is pinned' : 'blocked by E5'),
);
console.log(row('E3', null, 'corpus runs in the suite — `pnpm test`'));
console.log(
  row('E4', null, 'run `pnpm mutate` (~22 min, silent while running); floor 75, ratchet 80'),
);
console.log(
  row(
    'E5',
    gate.e5,
    gate.e5 ? 'no open wrong-score or unclassified findings' : `${gate.blockingE5.length} blocking`,
  ),
);

if (gate.blockingE5.length > 0) {
  console.log('\n  Blocking E5:');
  for (const f of gate.blockingE5) {
    const first = (f.note ?? '').split('. ')[0] ?? '';
    console.log(`    ${f.id}  [${f.severity}]  ${first}`);
  }
}

console.log(
  '\n  %d open / %d total — %s\n',
  gate.openCount,
  gate.totalCount,
  Object.entries(gate.openBySeverity)
    // Code-unit order, not localeCompare — H-066 removed exactly that call
    // from migrate.ts because collation varies with a Node build's ICU data.
    // Display-only here, but the idiom stays banned so nobody copies it.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${String(v)} ${k}`)
    .join(', '),
);

process.exit(gate.e5 ? 0 : 1);
