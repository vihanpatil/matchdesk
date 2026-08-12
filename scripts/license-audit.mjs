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
  // OSI-approved and permissive, in the same family as MIT/BSD/ISC. Omitted
  // from the original list by oversight, not by policy; `pako` declares
  // "(MIT AND Zlib)" and its LICENSE text is plain MIT.
  'Zlib',
]);

/** Permitted for devDependencies only. See ADR-003. */
const DEVELOPMENT_EXTRA = new Set(['MPL-2.0', 'CC-BY-4.0', 'CC-BY-3.0']);

/**
 * Per-package waivers for packages whose declared license string is not a valid
 * SPDX identifier, but whose actual LICENSE text was read and identified.
 *
 * **Pinned to an exact version on purpose.** A new version of a waived package
 * fails the audit again and must be re-inspected — a waiver is a statement
 * about a file someone actually read, not about a package name forever.
 *
 * Never add an entry here without opening the LICENSE file and recording what
 * it says. "Probably fine" is not evidence. See ADR-016.
 */
const METADATA_WAIVERS = new Map([
  [
    'duck@0.1.12',
    {
      declared: 'BSD',
      actual: 'BSD-2-Clause',
      evidence:
        'LICENSE inspected 2026-08-12: exactly 2 clauses, no "neither the name"/endorsement clause and no advertising clause, so neither BSD-3-Clause nor BSD-4-Clause. Copyright (c) 2013 Michael Williamson. Reaches us transitively via mammoth.',
    },
  ],
]);

/**
 * Evaluates an SPDX expression against an allowlist, with correct semantics.
 *
 * `A OR B` — a genuine choice, so the expression is acceptable if **any**
 * branch is acceptable. `A AND B` — both obligations apply, so **every** term
 * must be acceptable.
 *
 * The first version of this function collapsed both operators and required
 * every atom to be allowed. That was described in its own comment as "only ever
 * stricter", which was wrong: it is not stricter, it is **incorrect**, and it
 * rejected `jszip@3.10.1` — `(MIT OR GPL-3.0-or-later)` — whose LICENSE reads
 * "At your choice you may use it under the MIT license *or* the GPLv3". Taking
 * the MIT branch is exactly what the dual license exists to permit.
 *
 * Parenthesised sub-expressions are not parsed recursively; nesting deeper than
 * one level returns false rather than guessing, so an unparseable expression
 * fails the audit instead of slipping through.
 *
 * @param {string} expression
 * @param {Set<string>} allowed
 * @returns {boolean}
 */
function isAllowedExpression(expression, allowed) {
  const cleaned = expression.replace(/[()]/g, ' ').trim();
  if (cleaned === '') return false;

  // Top level is a disjunction of conjunctions: any acceptable branch wins.
  return cleaned.split(/\s+OR\s+/i).some((branch) =>
    branch
      .split(/\s+(?:AND|WITH)\s+/i)
      .map((atom) => atom.trim())
      .filter(Boolean)
      .every((atom) => allowed.has(atom)),
  );
}

/**
 * @typedef {{ name: string, version: string, license: string }} AuditedPackage
 *
 * @param {'production' | 'development'} scope
 * @returns {AuditedPackage[]}
 */
function collect(scope) {
  const flag = scope === 'production' ? '--prod' : '--dev';
  /** @type {string} */
  let raw;
  try {
    raw = execFileSync('pnpm', ['licenses', 'list', '--json', flag, '--recursive'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // pnpm exits non-zero when a workspace has no dependencies of that kind.
    const errStdout =
      typeof error === 'object' && error !== null
        ? /** @type {Record<string, unknown>} */ (error)['stdout']
        : undefined;
    const stdout = typeof errStdout === 'string' ? errStdout.trim() : '';
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

  /** @type {AuditedPackage[]} */
  const packages = [];
  const groups = /** @type {Record<string, unknown>} */ (parsed);
  for (const [license, entries] of Object.entries(groups)) {
    if (!Array.isArray(entries)) continue;
    for (const rawEntry of entries) {
      const entry = /** @type {Record<string, unknown>} */ (
        typeof rawEntry === 'object' && rawEntry !== null ? rawEntry : {}
      );
      const versions = entry['versions'];
      packages.push({
        name: typeof entry['name'] === 'string' ? entry['name'] : '(unknown)',
        version: Array.isArray(versions) ? versions.join(', ') : String(versions),
        license,
      });
    }
  }
  return packages;
}

/**
 * @param {'production' | 'development'} scope
 * @param {Set<string>} allowed
 */
function audit(scope, allowed) {
  const packages = collect(scope);
  /** @type {AuditedPackage[]} */
  const waived = [];
  const violations = packages.filter((pkg) => {
    if (isAllowedExpression(pkg.license, allowed)) return false;
    const waiver = METADATA_WAIVERS.get(`${pkg.name}@${pkg.version}`);
    if (waiver !== undefined && waiver.declared === pkg.license) {
      waived.push(pkg);
      return false;
    }
    return true;
  });
  return { packages, violations, waived };
}

function main() {
  const devAllowed = new Set([...PRODUCTION_ALLOWED, ...DEVELOPMENT_EXTRA]);

  const prod = audit('production', PRODUCTION_ALLOWED);
  const dev = audit('development', devAllowed);

  console.log(`License audit (ADR-003)`);
  console.log(`  production deps audited: ${prod.packages.length} (strict allowlist)`);
  console.log(`  development deps audited: ${dev.packages.length} (strict + MPL-2.0)`);

  // Waivers are printed every run. A silent waiver is indistinguishable from a
  // hole in the gate.
  for (const pkg of [...prod.waived, ...dev.waived]) {
    const waiver = METADATA_WAIVERS.get(`${pkg.name}@${pkg.version}`);
    console.log(
      `  ⚠ waived: ${pkg.name}@${pkg.version} declares "${pkg.license}", verified as ${String(waiver?.actual)} (ADR-016)`,
    );
  }

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
