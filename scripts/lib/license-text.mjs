/**
 * Licence-TEXT detection, as distinct from licence-EXPRESSION validation.
 *
 * WHY THIS IS A SEPARATE MODULE (same reasoning as `gate-registry.mjs`,
 * ADR-028). `scripts/license-audit.mjs` is the I/O shell: it shells out to
 * `pnpm licenses list`, decides what to print, and decides the exit code.
 * These functions decide nothing about the audit's outcome beyond "does this
 * directory actually contain licence text" — a question answerable against a
 * plain fixture directory, with no `pnpm` invocation and no network.
 *
 * THE FINDING THIS CLOSES (ADR-031). `license-audit.mjs` validates a
 * package's *declared* SPDX expression against an allowlist. It has no
 * mechanism to notice that a package ships **no LICENSE file at all** — its
 * declared metadata is trusted uncritically as long as the string parses.
 * `emscripten-wasm-loader@3.0.3` (reached transitively via the rejected
 * `cld3-asm`) declares `MIT` and ships neither a LICENSE file in its npm
 * tarball nor one in its GitHub repository; `license-audit.mjs` passed it
 * silently. ADR-016 refused `duck@0.1.12`'s bare `"BSD"` because the gate
 * "correctly refused to guess" at an ambiguous SPDX string — an
 * unverifiable-because-ABSENT licence is the same problem wearing better
 * metadata, and until this module existed it passed.
 *
 * MEASURED, NOT ASSUMED. A scan of the currently-installed production tree
 * (34 packages) found 2 that ship no discoverable licence text of their own:
 * `@napi-rs/canvas-darwin-arm64@1.0.5` and `dingbat-to-unicode@1.0.1` — both
 * genuine transitive production dependencies, reached via `pdfjs-dist` and
 * `mammoth` respectively (confirmed with `pnpm why`), not hypothetical. A
 * scan of devDependencies found one more, `stackback@0.0.2` (via vitest's own
 * `why-is-node-running`). See `scripts/license-audit.mjs` for the
 * `NO_LICENSE_TEXT_WAIVERS` map and the disposition of each.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Filenames that carry licence text directly, matched case-insensitively.
 * Bare (`LICENSE`), with a doc extension (`LICENSE.md`, `LICENCE.txt`), or
 * with the SPDX-ish suffix some packages append when more than one licence
 * ships in the same package (`LICENSE-MIT`) — `ignore@5.3.2` ships exactly
 * that shape, found by reading its tarball, not assumed. The exclusion below
 * keeps a stray `license-check.js` helper script or `license.yaml` config
 * from being mistaken for licence text.
 *
 * @param {string} name
 */
export function isLicenseFilename(name) {
  return LICENSE_FILENAME_RE.test(name) && !NON_LICENSE_SUFFIX_RE.test(name);
}

const LICENSE_FILENAME_RE = /^(licen[sc]e|copying|notice)([.-][a-z0-9][a-z0-9.-]*)?$/i;
const NON_LICENSE_SUFFIX_RE = /\.(c|m)?[jt]sx?$|\.json$|\.map$|\.ya?ml$|\.css$|\.html?$/i;

const README_FILENAME_RE = /^readme(\.(md|markdown|txt|rst))?$/i;

/** ATX heading (`# License`, `#### LICENSE`) — `hash.js@1.1.7` uses 4 hashes. */
const ATX_LICENSE_HEADING_RE = /^#{1,6}\s*licen[sc]e\b/im;

/**
 * Setext heading (`Licence` on one line, `-------` or `=======` underneath)
 * — `natural-compare@1.4.0` and `imurmurhash@0.1.4` both use this style, and
 * an ATX-only regex misses it entirely. Found by reading real packages that
 * the first, narrower version of this module wrongly flagged as missing.
 *
 * @param {string} text
 */
function hasSetextLicenseHeading(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    // `noUncheckedIndexedAccess` is on, so both of these are `string |
    // undefined` however obvious the bound looks.
    const heading = lines[i];
    const underline = lines[i + 1];
    if (heading === undefined || underline === undefined) continue;
    const isHeadingText = /^licen[sc]e\b/i.test(heading.trim());
    const isUnderline = /^(-{2,}|={2,})\s*$/.test(underline.trim());
    if (isHeadingText && isUnderline) return true;
  }
  return false;
}

/**
 * True if `dir` contains a README with a licence section — heading only,
 * deliberately. A bare prose mention of "MIT" or "see LICENSE" is not
 * licence text; requiring a heading is what keeps this from degrading into
 * "the word license appears somewhere", which would defeat the point of the
 * check (compare `headingIds` in `gate-registry.mjs`, same shape of guard).
 *
 * @param {string} dir
 * @param {readonly string[]} filenames
 */
export function readmeHasLicenseSection(dir, filenames) {
  const readme = filenames.find((f) => README_FILENAME_RE.test(f));
  if (readme === undefined) return false;
  /** @type {string} */
  let text;
  try {
    text = readFileSync(join(dir, readme), 'utf8');
  } catch {
    return false; // unreadable README is no evidence, not a pass
  }
  return ATX_LICENSE_HEADING_RE.test(text) || hasSetextLicenseHeading(text);
}

/**
 * True if this ONE resolved install directory carries licence text of its
 * own: a recognised file, or an embedded README section.
 *
 * @param {string} dir
 */
export function directoryHasLicenseText(dir) {
  /** @type {string[]} */
  let filenames;
  try {
    filenames = readdirSync(dir);
  } catch {
    return false; // install path missing/unreadable — no evidence, so no pass
  }
  if (filenames.some(isLicenseFilename)) return true;
  return readmeHasLicenseSection(dir, filenames);
}

/**
 * True only if EVERY resolved install path for this audited row carries
 * licence text.
 *
 * A row can cover more than one physical path when `pnpm licenses list`
 * groups two differently-installed versions of the same name under one
 * licence string — `ignore@5.3.2` and `ignore@7.0.6` both show up this way
 * in this repo's own tree. Requiring ALL of them, rather than ANY, means a
 * passing newer version can never quietly cover for an older one that has
 * nothing on disk. Refuses to guess, per ADR-016. An empty path list is
 * treated as no evidence, not a pass — `pnpm licenses list` failing to
 * report a path is itself a reason to doubt the row, not a reason to wave it
 * through.
 *
 * @param {readonly string[]} paths
 */
export function hasLicenseText(paths) {
  return paths.length > 0 && paths.every(directoryHasLicenseText);
}

/**
 * Looks up a per-package waiver pinned to an exact `name@version`, and
 * requires the waiver's recorded declared licence to still match what was
 * just observed on this run.
 *
 * Shared by `METADATA_WAIVERS` and `NO_LICENSE_TEXT_WAIVERS` in
 * `scripts/license-audit.mjs` — same pinning discipline, same reason
 * (ADR-016): a new version of a waived package fails the audit again and
 * must be re-inspected. A waiver is a statement about a specific file
 * someone actually read at a specific version, not about a package name
 * forever. Re-checking `declared` also catches the pathological case of the
 * declared licence string changing without a version bump.
 *
 * Generic in the waiver's value type so the caller keeps every field it
 * recorded — `METADATA_WAIVERS` carries `actual`, `NO_LICENSE_TEXT_WAIVERS`
 * carries `basis`/`evidence`, and narrowing both to `{ declared }` here would
 * erase exactly the evidence the audit is supposed to print.
 *
 * @template {{ declared: string }} TWaiver
 * @param {ReadonlyMap<string, TWaiver>} waivers
 * @param {{ name: string, version: string, license: string }} pkg
 * @returns {TWaiver | undefined}
 */
export function lookupWaiver(waivers, pkg) {
  const waiver = waivers.get(`${pkg.name}@${pkg.version}`);
  if (waiver === undefined || waiver.declared !== pkg.license) return undefined;
  return waiver;
}
