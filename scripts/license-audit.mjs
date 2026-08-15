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
 * A SECOND, INDEPENDENT CHECK (ADR-031 finding, closed here): the allowlist
 * above validates a package's *declared* SPDX expression, which is metadata
 * a package author typed into `package.json` — it says nothing about
 * whether the tarball actually ships the licence text that declaration
 * promises. `emscripten-wasm-loader@3.0.3` declares MIT and ships no LICENSE
 * file anywhere, and this audit passed it silently until the check below
 * existed. Every audited package, regardless of whether its SPDX expression
 * passes, must also carry licence text of its own (`hasLicenseText()` in
 * `scripts/lib/license-text.mjs`) or a pinned, evidenced entry in
 * `NO_LICENSE_TEXT_WAIVERS` below. A permissive licence with no text behind
 * it is unverified, and unverified is not a pass either — unless the team has
 * knowingly accepted that as a risk, which is a different, LOUDER-printed
 * thing than a verification. See the `basis` field on that map.
 *
 * Exits 0 when clean, 1 on any violation, 2 if the audit itself could not run
 * (never silently green — rule 0.2.4).
 */

import { execFileSync } from 'node:child_process';

import { hasLicenseText, lookupWaiver } from './lib/license-text.mjs';

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
 * Per-package waivers for packages whose npm tarball ships **no licence text
 * of its own** — no LICENSE/COPYING/NOTICE file and no embedded README
 * section (see `scripts/lib/license-text.mjs`).
 *
 * THE FINDING THIS CLOSES (ADR-031). The audit above validates a package's
 * *declared* SPDX expression but had no mechanism to notice an absent
 * LICENSE file. `emscripten-wasm-loader@3.0.3` (reached via the rejected
 * `cld3-asm`) declares MIT and ships neither a LICENSE file in its npm
 * tarball nor one in its GitHub repository; this audit passed it silently.
 * ADR-016 refused `duck@0.1.12`'s bare `"BSD"` because the gate "correctly
 * refused to guess" at ambiguous metadata — an unverifiable-because-ABSENT
 * licence is the same problem wearing better metadata, and until the check
 * below existed it passed too.
 *
 * MEASURED, NOT ASSUMED. Scanning the currently-installed tree on 2026-08-14
 * (34 production + 305 development rows, `pnpm licenses list --recursive`,
 * cross-referenced against each package's own install directory) found
 * exactly 3 packages with no licence text of their own: 2 of 34 production,
 * 1 additional in development-only. All 3 are waived below, but **not on the
 * same footing** — every entry below carries a `basis` field because they are
 * not the same claim:
 *
 *   - `'verified-elsewhere'` — the licence text was located and read at a
 *     named location outside the tarball. This is a verification, same
 *     epistemic status as `METADATA_WAIVERS`: someone read an actual file.
 *   - `'no-text-exists'` — the declared SPDX identifier is valid and
 *     unambiguous, but after checking the tarball, the upstream repository,
 *     and (where applicable) the GitHub licence API, no licence text exists
 *     ANYWHERE. This is a **risk acceptance, not a verification** — nobody
 *     has read text that confirms the declaration, because no such text is
 *     reachable. Printed louder than `'verified-elsewhere'` for exactly this
 *     reason: a reader skimming a green run must not mistake an accepted
 *     risk for a clean verification.
 *
 * `@napi-rs/canvas-darwin-arm64@1.0.5` is `'verified-elsewhere'`: it is the
 * platform-binary half of `@napi-rs/canvas@1.0.5` — same repository, same
 * version, same publisher, its own README says so explicitly — and that
 * sibling package ships the full MIT text, corroborated independently by the
 * GitHub licence API. This is ADR-016's `duck@0.1.12` situation exactly.
 *
 * `dingbat-to-unicode@1.0.1` and `stackback@0.0.2` are `'no-text-exists'`.
 * **Why `dingbat-to-unicode` is tolerable despite having no text, when
 * `duck@0.1.12`'s bare `"BSD"` was not tolerated**: `duck`'s objection was
 * AMBIGUITY — `"BSD"` alone does not say whether the advertising and
 * endorsement clauses apply, and that difference carries materially
 * different obligations. `dingbat-to-unicode` declares `BSD-2-Clause` —
 * valid, unambiguous SPDX, no such question to resolve. What is missing here
 * is CORROBORATION, not clarity: nothing on disk or upstream confirms the
 * declaration, but the declaration itself is not vague about what it would
 * mean if true. That is a strictly weaker objection than ADR-016's original
 * one, which is why this is recorded as an accepted risk (see `basis`)
 * rather than refused outright the way `duck` was.
 *
 * Given the count — a handful, not "many" — a hard failure by default (no
 * allowance at all) was the first design considered, and rejected: it would
 * make `license:audit` (which runs in the husky pre-commit hook) red-line
 * every commit in the repo over transitive packages nobody here controls —
 * exactly the "a gate must not be breakable by another gate" failure ADR-026
 * already records (the `.stryker-tmp` case). A check that behaves that way
 * on day one gets itself reverted, which reopens the exact hole this module
 * exists to close. The shape below is ADR-016's own instrument, reused
 * rather than reinvented: waive narrowly, pin exactly, demand evidence,
 * print on every run — now split by `basis` so "verified" and "accepted
 * risk" cannot be confused for each other at a glance.
 *
 * **Pinned to an exact version, on purpose**, for the same reason as
 * `METADATA_WAIVERS`: a new version of a waived package ships a new tarball,
 * which may or may not have gained a LICENSE file, so it fails this check
 * again and must be re-inspected — verified by negative control for all
 * three entries, see `scripts/lib/license-text.test.mjs` (`lookupWaiver`,
 * "does NOT match once the version changes") and the live re-run recorded in
 * this session's report to the tech lead.
 *
 * Never add an entry here without opening the actual evidence — the
 * package's own tarball, its upstream repository, and (for `basis:
 * 'verified-elsewhere'`) the specific outside location the text was read at.
 * "Probably fine" is not evidence, same rule as `METADATA_WAIVERS`. For
 * `basis: 'no-text-exists'`, the evidence string must say precisely where
 * you looked and that it came back empty — the absence itself has to be
 * demonstrated, not assumed.
 */
const NO_LICENSE_TEXT_WAIVERS = new Map([
  [
    '@napi-rs/canvas-darwin-arm64@1.0.5',
    {
      declared: 'MIT',
      basis: 'verified-elsewhere',
      verifiedVia: '@napi-rs/canvas@1.0.5 LICENSE (sibling package) + GitHub licence API',
      evidence:
        'Ships only README.md (one line: "This is the aarch64-apple-darwin binary for @napi-rs/canvas"), package.json, and a compiled .node binary — no LICENSE file, no embedded README section. It is the platform-specific binary half of @napi-rs/canvas@1.0.5: same repository, same version, same publisher, and its own README says so explicitly. That sibling package DOES ship the full MIT licence text at node_modules/@napi-rs/canvas/LICENSE ("MIT License / Copyright (c) 2020 lynweklm@gmail.com"), and the GitHub API for the upstream repository (Brooooooklyn/canvas) independently reports license.spdx_id "MIT". Reaches this tree transitively via pdfjs-dist (confirmed with `pnpm why @napi-rs/canvas-darwin-arm64`). Checked 2026-08-14.',
    },
  ],
  [
    'dingbat-to-unicode@1.0.1',
    {
      declared: 'BSD-2-Clause',
      basis: 'no-text-exists',
      checkedVia: 'npm tarball + upstream GitHub repo root + GitHub licence API — all three empty',
      evidence:
        'Looked and came back empty in all three places: (1) the npm tarball — only README.md, package.json, and dist/, no LICENSE/COPYING/NOTICE and no licence section in the README; (2) the upstream GitHub repository, mwilliamson/dingbat-to-unicode, default branch main — root contains only .github, js, python, dingbats.csv, generate.py, checked via the GitHub contents API, no LICENSE file; (3) the GitHub licence API for that repository, which independently reports license: null. Declares BSD-2-Clause — valid, unambiguous SPDX, unlike duck@0.1.12’s bare "BSD" — so the objection here is missing corroboration, not ambiguity (see the block comment above). Reaches this tree transitively via mammoth (confirmed with `pnpm why dingbat-to-unicode`), and is production-reachable — it ships to the recruiter. Authored by the same Michael Williamson as the already-waived duck@0.1.12, evidently not this author’s practice for every package. Checked 2026-08-14.',
    },
  ],
  [
    'stackback@0.0.2',
    {
      declared: 'MIT',
      basis: 'no-text-exists',
      checkedVia: 'npm tarball + upstream GitHub repo root + GitHub licence API — all three empty',
      evidence:
        'Looked and came back empty in all three places: (1) the npm tarball — README.md (no licence section), package.json, and source files only, no LICENSE/COPYING/NOTICE; (2) the upstream GitHub repository, shtylman/node-stackback — no LICENSE file at the root; (3) the GitHub licence API for that repository, which independently reports license: null. Declares MIT — valid, unambiguous SPDX. Reaches this tree only as a development dependency, transitively via vitest’s own why-is-node-running (confirmed with `pnpm why stackback`) — it never ships to the recruiter, which is why the risk accepted here is smaller than dingbat-to-unicode’s despite the identical evidentiary gap. Checked 2026-08-14.',
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
 * `paths` carries every resolved install directory backing this row — more
 * than one when `pnpm licenses list` groups two different installed
 * versions of the same package name under one licence string. It exists
 * purely to let `hasLicenseText()` look at the actual tarball on disk; the
 * SPDX check above never needed it because it trusts declared metadata.
 *
 * @typedef {{ name: string, version: string, license: string, paths: string[] }} AuditedPackage
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
      const paths = entry['paths'];
      packages.push({
        name: typeof entry['name'] === 'string' ? entry['name'] : '(unknown)',
        version: Array.isArray(versions) ? versions.join(', ') : String(versions),
        license,
        paths: Array.isArray(paths) ? paths.filter((p) => typeof p === 'string') : [],
      });
    }
  }
  return packages;
}

/**
 * Two INDEPENDENT checks run over every package, not one check with an
 * early exit: a permissively-licensed package can still ship no licence
 * text (the ADR-031 blind spot), and a package with a full LICENSE file can
 * still declare an expression the allowlist rejects. Either failure alone is
 * disqualifying, so both run regardless of the other's result.
 *
 * @param {'production' | 'development'} scope
 * @param {Set<string>} allowed
 */
function audit(scope, allowed) {
  const packages = collect(scope);
  /** @type {AuditedPackage[]} */
  const metadataWaived = [];
  /** @type {AuditedPackage[]} */
  const noLicenseTextWaived = [];
  /** @type {(AuditedPackage & { reason: 'disallowed-license' | 'no-license-text' })[]} */
  const violations = [];

  for (const pkg of packages) {
    if (!isAllowedExpression(pkg.license, allowed)) {
      const waiver = lookupWaiver(METADATA_WAIVERS, pkg);
      if (waiver !== undefined) metadataWaived.push(pkg);
      else violations.push({ ...pkg, reason: 'disallowed-license' });
    }

    if (!hasLicenseText(pkg.paths)) {
      const waiver = lookupWaiver(NO_LICENSE_TEXT_WAIVERS, pkg);
      if (waiver !== undefined) noLicenseTextWaived.push(pkg);
      else violations.push({ ...pkg, reason: 'no-license-text' });
    }
  }

  return { packages, violations, metadataWaived, noLicenseTextWaived };
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
  for (const pkg of [...prod.metadataWaived, ...dev.metadataWaived]) {
    const waiver = lookupWaiver(METADATA_WAIVERS, pkg);
    console.log(
      `  ⚠ waived (declared-license): ${pkg.name}@${pkg.version} declares "${pkg.license}", verified as ${String(waiver?.actual)} (ADR-016)`,
    );
  }

  const allNoLicenseTextWaived = [...prod.noLicenseTextWaived, ...dev.noLicenseTextWaived];
  const verifiedElsewhere = allNoLicenseTextWaived.filter(
    (pkg) => lookupWaiver(NO_LICENSE_TEXT_WAIVERS, pkg)?.basis === 'verified-elsewhere',
  );
  const riskAccepted = allNoLicenseTextWaived.filter(
    (pkg) => lookupWaiver(NO_LICENSE_TEXT_WAIVERS, pkg)?.basis === 'no-text-exists',
  );

  // `verified-elsewhere` reads and prints like any other waiver above: someone
  // read a real file, just not the one in this tarball.
  for (const pkg of verifiedElsewhere) {
    const waiver = lookupWaiver(NO_LICENSE_TEXT_WAIVERS, pkg);
    console.log(
      `  ⚠ waived (licence text verified elsewhere): ${pkg.name}@${pkg.version} declares "${pkg.license}", text verified via ${String(waiver?.verifiedVia)} (ADR-031 finding, scripts/license-audit.mjs)`,
    );
  }

  // `no-text-exists` is a RISK ACCEPTANCE, not a verification — nobody has
  // read text confirming the declaration, because none is reachable. Printed
  // louder and set apart from every other waiver line on purpose: someone
  // skimming a green run for "was anything read?" must not mistake this for
  // one of the lines above.
  if (riskAccepted.length > 0) {
    console.log(
      '\n🚨🚨🚨 RISK ACCEPTED — no licence text found ANYWHERE, not merely unfound here 🚨🚨🚨',
    );
    for (const pkg of riskAccepted) {
      const waiver = lookupWaiver(NO_LICENSE_TEXT_WAIVERS, pkg);
      console.log(
        `  🚨 ${pkg.name}@${pkg.version} declares "${pkg.license}" (valid, unambiguous SPDX) — checked ${String(waiver?.checkedVia)}`,
      );
      console.log(`     evidence: ${String(waiver?.evidence)}`);
    }
    console.log(
      `\nΣ risk-accepted (no licence text exists anywhere): ${riskAccepted.length} package(s) — see 🚨 above before treating this run as clean.\n`,
    );
  }

  const failures = [
    ...prod.violations.map((v) => ({ ...v, scope: 'production' })),
    ...dev.violations.map((v) => ({ ...v, scope: 'development' })),
  ];

  if (failures.length > 0) {
    console.error('\n❌ License audit FAILED\n');
    for (const failure of failures) {
      if (failure.reason === 'no-license-text') {
        console.error(
          `  [${failure.scope}] ${failure.name}@${failure.version} — declares "${failure.license}" but ships NO discoverable licence text (no LICENSE/COPYING/NOTICE file, no licence section in README, checked at ${failure.paths.length} path(s))`,
        );
      } else {
        console.error(
          `  [${failure.scope}] ${failure.name}@${failure.version} — ${failure.license}`,
        );
      }
    }
    console.error(
      '\nFor a disallowed licence: add a justified exception to scripts/license-audit.mjs and record an ADR, or drop the dependency.' +
        "\nFor missing licence text: open the tarball and the upstream repository yourself. If you can verify what governs it from elsewhere (a sibling package, a tagged release, the SPDX registry), add a pinned NO_LICENSE_TEXT_WAIVERS entry with basis: 'verified-elsewhere' and that evidence. If nothing is reachable anywhere, that is basis: 'no-text-exists' — a risk acceptance the team must knowingly take, not a verification; add it as such, pinned exact, with evidence of everywhere you looked and that it came back empty. Do not add a waiver you cannot back with a file you actually read, or an absence you actually confirmed.",
    );
    process.exit(1);
  }

  console.log(
    '\n✅ License audit passed — no disallowed licenses, and every audited package carries its own licence text or a recorded, evidenced waiver.',
  );
}

try {
  main();
} catch (error) {
  console.error('❌ License audit could not run:', error instanceof Error ? error.message : error);
  process.exit(2);
}
