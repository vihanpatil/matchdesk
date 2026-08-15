import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  directoryHasLicenseText,
  hasLicenseText,
  isLicenseFilename,
  lookupWaiver,
  readmeHasLicenseSection,
} from './license-text.mjs';

/**
 * These tests exist because the first version of this module — ATX headings
 * only, a narrow filename list — silently under-counted on the very tree it
 * was measuring: it missed `ignore@5.3.2`'s `LICENSE-MIT`, `hash.js@1.1.7`'s
 * `#### LICENSE` (four hashes), and `natural-compare@1.4.0`'s Setext-style
 * `Licence\n-------`. Each fixture below is a real shape read off a real
 * installed package, not an invented one.
 */

/** @type {string[]} */
const scratchDirs = [];

/** @returns {string} a fresh temp directory, cleaned up after the test */
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'license-text-test-'));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (scratchDirs.length > 0) {
    const dir = scratchDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe('isLicenseFilename', () => {
  it('accepts the bare and cased forms', () => {
    for (const name of ['LICENSE', 'License', 'license', 'LICENCE', 'COPYING', 'NOTICE']) {
      expect(isLicenseFilename(name)).toBe(true);
    }
  });

  it('accepts recognised doc extensions', () => {
    for (const name of ['LICENSE.md', 'LICENSE.txt', 'LICENCE.markdown', 'COPYING.md']) {
      expect(isLicenseFilename(name)).toBe(true);
    }
  });

  it('accepts the SPDX-suffixed shape ignore@5.3.2 actually ships', () => {
    expect(isLicenseFilename('LICENSE-MIT')).toBe(true);
  });

  it('rejects a helper script whose name merely starts with "license"', () => {
    // If this matched, any package with a `license-check.js` build script
    // would be wrongly treated as carrying licence text — the exact
    // over-matching this filename pattern has to avoid.
    expect(isLicenseFilename('license-check.js')).toBe(false);
    expect(isLicenseFilename('license.yaml')).toBe(false);
  });

  it('rejects unrelated files', () => {
    expect(isLicenseFilename('index.js')).toBe(false);
    expect(isLicenseFilename('README.md')).toBe(false);
  });
});

describe('readmeHasLicenseSection', () => {
  it('finds an ATX heading', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'README.md'), '# intro\n\n## License\n\nMIT, copyright someone.\n');
    expect(readmeHasLicenseSection(dir, ['README.md'])).toBe(true);
  });

  it('finds a 4-hash ATX heading — hash.js@1.1.7’s real shape', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'README.md'), '#### LICENSE\n\nThis software is licensed under MIT.\n');
    expect(readmeHasLicenseSection(dir, ['README.md'])).toBe(true);
  });

  it('finds a Setext heading — natural-compare@1.4.0’s real shape', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'README.md'), 'Licence\n-------\n\nCopyright (c) someone.\n');
    expect(readmeHasLicenseSection(dir, ['README.md'])).toBe(true);
  });

  it('does NOT match a prose mention with no heading', () => {
    // The check that matters: if this matched, every README that merely
    // says "see LICENSE for details" would count as carrying licence text,
    // which defeats the entire point of the module.
    const dir = tempDir();
    writeFileSync(
      join(dir, 'README.md'),
      'This package is MIT licensed, see LICENSE for details.\n',
    );
    expect(readmeHasLicenseSection(dir, ['README.md'])).toBe(false);
  });

  it('returns false when there is no README at all', () => {
    expect(readmeHasLicenseSection('/does/not/matter', [])).toBe(false);
  });
});

describe('directoryHasLicenseText', () => {
  it('is true when a LICENSE file is present', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'LICENSE'), 'MIT License\n...\n');
    expect(directoryHasLicenseText(dir)).toBe(true);
  });

  it('is true when only an embedded README section is present', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'README.md'), '## License\n\nMIT.\n');
    expect(directoryHasLicenseText(dir)).toBe(true);
  });

  /**
   * THE NEGATIVE CONTROL THE TASK REQUIRES. A package directory with neither
   * a licence file nor an embedded README section — the exact shape of
   * `dingbat-to-unicode@1.0.1` and `@napi-rs/canvas-darwin-arm64@1.0.5` as
   * measured in this repo's own tree (see `scripts/license-audit.mjs`) —
   * must be reported as NOT carrying licence text. If this assertion passed
   * with `false` flipped to `true`, the check could not fire and the blind
   * spot this module exists to close would still be open.
   */
  it('is false when there is nothing to find — the guard actually fires', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'README.md'), 'Just a description, no licence section.\n');
    writeFileSync(join(dir, 'package.json'), '{"name":"x","license":"MIT"}\n');
    expect(directoryHasLicenseText(dir)).toBe(false);
  });

  it('is false, not throwing, when the directory does not exist', () => {
    expect(directoryHasLicenseText('/definitely/not/a/real/path/xyz')).toBe(false);
  });
});

describe('hasLicenseText', () => {
  it('is true when every resolved path has licence text', () => {
    const a = tempDir();
    const b = tempDir();
    writeFileSync(join(a, 'LICENSE'), 'MIT\n');
    writeFileSync(join(b, 'LICENSE-MIT'), 'MIT\n');
    expect(hasLicenseText([a, b])).toBe(true);
  });

  it('is false when ANY resolved path is missing licence text', () => {
    // Deliberate: a grouped row (two versions of the same name under one
    // licence string, e.g. ignore@5.3.2 + ignore@7.0.6 in this repo) must
    // not let a passing version mask a failing one. "some" instead of
    // "every" here would be exactly that mistake.
    const a = tempDir();
    const b = tempDir();
    writeFileSync(join(a, 'LICENSE'), 'MIT\n');
    // b has nothing.
    expect(hasLicenseText([a, b])).toBe(false);
  });

  it('is false for an empty path list — no evidence is not a pass', () => {
    expect(hasLicenseText([])).toBe(false);
  });
});

describe('lookupWaiver', () => {
  const waivers = new Map([['pkg@1.0.0', { declared: 'MIT', evidence: 'read it' }]]);

  it('matches an exact name@version with the same declared license', () => {
    expect(lookupWaiver(waivers, { name: 'pkg', version: '1.0.0', license: 'MIT' })).toBeDefined();
  });

  /**
   * THE OTHER NEGATIVE CONTROL THE TASK REQUIRES. ADR-016 says a new version
   * of a waived package "fails again and must be re-inspected". This proves
   * the pin actually pins: bump the version by one patch release with
   * nothing else changed, and the waiver must stop applying.
   */
  it('does NOT match once the version changes', () => {
    expect(
      lookupWaiver(waivers, { name: 'pkg', version: '1.0.1', license: 'MIT' }),
    ).toBeUndefined();
  });

  it('does NOT match when the declared license drifts at the same version', () => {
    expect(
      lookupWaiver(waivers, { name: 'pkg', version: '1.0.0', license: 'Apache-2.0' }),
    ).toBeUndefined();
  });

  it('does NOT match an unrelated package', () => {
    expect(
      lookupWaiver(waivers, { name: 'other', version: '1.0.0', license: 'MIT' }),
    ).toBeUndefined();
  });
});
