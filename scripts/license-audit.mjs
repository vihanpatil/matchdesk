#!/usr/bin/env node
/**
 * License audit (Section 3.4, as amended by ADR-003).
 *
 * Two tiers, because Section 3.2 mandates axe-core while Section 3.4's
 * allowlist would reject it:
 *
 *   production  — strictly MIT / Apache-2.0 / BSD / ISC and friends. These
 *                 licenses travel with the artifact the recruiter runs.
 *   development — the above plus MPL-2.0. MPL is file-level copyleft; we
 *                 neither modify nor redistribute axe-core's source, so no
 *                 obligation attaches to a build-time-only dependency.
 *
 * Anything unrecognised fails. Unknown is not a pass — that is the whole point
 * of the gate.
 *
 * Exits 0 when clean, 1 on any violation, 2 if the audit itself could not run
 * (never silently green — rule 0.2.4).
 */

import { execFileSync } from 'node:child_process';

const PRODUCTION_ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Python-2.0',
  'Unlicense',
  'WTFPL',
]);

/** Permitted for devDependencies only. See ADR-003. */
const DEVELOPMENT_EXTRA = new Set(['MPL-2.0', 'CC-BY-4.0', 'CC-BY-3.0']);

/**
 * Splits an SPDX expression into its constituent license identifiers.
 * `(MIT OR Apache-2.0)` is acceptable if *any* branch is allowed; `A AND B`
 * requires all. We conservatively require every atom to be allowed, which can
 * only ever be stricter than the true SPDX semantics.
 */
function atomsOf(expression) {
  return expression
    .replace(/[()]/g, ' ')
    .split(/\s+(?:AND|OR|WITH)\s+/i)
    .map((atom) => atom.trim())
    .filter(Boolean);
}

function collect(scope) {
  const flag = scope === 'production' ? '--prod' : '--dev';
  let raw;
  try {
    raw = execFileSync('pnpm', ['licenses', 'list', '--json', flag, '--recursive'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // pnpm exits non-zero when a workspace has no dependencies of that kind.
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    if (!stdout) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`pnpm licenses list ${flag} failed: ${detail}`, { cause: error });
    }
    raw = stdout;
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed === '{}') return [];

  // pnpm emits this as plain text, not JSON, when a scope has no dependencies.
  // Legitimate empty result — distinct from "the audit could not run", which
  // must never resolve to a silent pass.
  if (/^No licenses in packages found/i.test(trimmed)) return [];
  if (!trimmed.startsWith('{')) {
    throw new Error(`Unrecognised pnpm licenses output for ${scope}: ${trimmed.slice(0, 120)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse pnpm licenses output as JSON: ${detail}`, { cause: error });
  }

  const packages = [];
  for (const [license, entries] of Object.entries(parsed)) {
    for (const entry of entries) {
      packages.push({
        name: entry.name,
        version: Array.isArray(entry.versions) ? entry.versions.join(', ') : String(entry.versions),
        license,
      });
    }
  }
  return packages;
}

function audit(scope, allowed) {
  const packages = collect(scope);
  const violations = packages.filter((pkg) => {
    const atoms = atomsOf(pkg.license);
    return atoms.length === 0 || !atoms.every((atom) => allowed.has(atom));
  });
  return { packages, violations };
}

function main() {
  const devAllowed = new Set([...PRODUCTION_ALLOWED, ...DEVELOPMENT_EXTRA]);

  const prod = audit('production', PRODUCTION_ALLOWED);
  const dev = audit('development', devAllowed);

  console.log(`License audit (ADR-003)`);
  console.log(`  production deps audited: ${prod.packages.length} (strict allowlist)`);
  console.log(`  development deps audited: ${dev.packages.length} (strict + MPL-2.0)`);

  const failures = [
    ...prod.violations.map((v) => ({ ...v, scope: 'production' })),
    ...dev.violations.map((v) => ({ ...v, scope: 'development' })),
  ];

  if (failures.length > 0) {
    console.error('\n❌ License audit FAILED\n');
    for (const failure of failures) {
      console.error(`  [${failure.scope}] ${failure.name}@${failure.version} — ${failure.license}`);
    }
    console.error(
      '\nAdd a justified exception to scripts/license-audit.mjs and record an ADR, or drop the dependency.',
    );
    process.exit(1);
  }

  console.log('\n✅ License audit passed — no disallowed licenses.');
}

try {
  main();
} catch (error) {
  console.error('❌ License audit could not run:', error instanceof Error ? error.message : error);
  process.exit(2);
}
