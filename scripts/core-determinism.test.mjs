import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join } from 'node:path';

/**
 * Architectural pin for H-002's classification.
 *
 * H-002 says cross-machine determinism is not guaranteed, because ONNX Runtime
 * float kernels are not bit-reproducible across CPU architecture, thread count
 * or ORT version. Triaged 2026-08-13: **that mechanism does not exist in the
 * engine.** No ORT, no embedding model, and — after H-076 removed
 * `10 ** decimals` from `roundHalfUp` — no operation anywhere in the
 * score-affecting path that a conforming platform is permitted to vary. Only
 * IEEE-754 `+ - * /`, which is correctly rounded everywhere, and exact `Math`
 * helpers. So H-002 is not wrong-score today. It becomes live the moment
 * cascade step 4 (embeddings) lands.
 *
 * **A classification resting on an unenforced property rots.** This test is
 * the enforcement: add a transcendental, an exponentiation operator, an
 * inference runtime or `Math.random` to core and it fails. **That failure is
 * the signal to RE-TRIAGE H-002 — not to relax this test.** It is the H-070
 * lesson applied forward: a claim with no test that can reach it is not
 * pinned.
 *
 * It lives in `scripts/` rather than beside the code it scans because
 * `packages/core` is pure and does no I/O (Section 3.1), and the lint rule
 * enforcing that is correct — reading source files is this file's whole job.
 */

const CORE_SRC = join(dirname(fileURLToPath(import.meta.url)), '../packages/core/src');

/**
 * Correctly-rounded or exact operations. IEEE-754 requires `+ - * /` to be
 * correctly rounded, and these helpers are exact selections or integer
 * roundings, so every one is bit-identical across conforming platforms.
 */
const DETERMINISTIC_MATH = new Set([
  'max',
  'min',
  'abs',
  'round',
  'floor',
  'ceil',
  'trunc',
  'sign',
]);

/**
 * Strips comments so the scan sees executable code only.
 *
 * Without this the checks are unusable. This codebase's comments are dense
 * prose full of `**bold**` markdown and references to `Math.pow`, and the
 * first two failures this test ever produced were exactly that. A guard whose
 * failures are mostly false positives gets deleted, and then the property it
 * protected is silently unenforced.
 *
 * @param {string} source
 * @returns {string}
 */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/**
 * Every non-test `.ts` file under `packages/core/src`.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function sourceFiles(dir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (extname(entry.name) !== '.ts') continue;
    if (/\.(test|spec|property|metamorphic|arch)\./.test(entry.name)) continue;
    found.push(full);
  }
  return found;
}

/** @param {string} f */
const rel = (f) => f.replace(CORE_SRC, 'packages/core/src');

describe('H-002 · packages/core has no source of cross-machine float drift', () => {
  const files = sourceFiles(CORE_SRC);

  it('scans a non-empty set of files', () => {
    // Without this, every check below passes vacuously on an empty list —
    // H-004's exact shape, where the measured file set was quietly too small.
    expect(files.length).toBeGreaterThan(10);
  });

  it('uses no transcendental or approximated Math operation', () => {
    /** @type {string[]} */
    const offenders = [];
    for (const file of files) {
      for (const match of codeOnly(readFileSync(file, 'utf8')).matchAll(/Math\.([a-zA-Z0-9_]+)/g)) {
        const name = match[1];
        if (name !== undefined && !DETERMINISTIC_MATH.has(name))
          offenders.push(`${rel(file)}: Math.${name}`);
      }
    }
    // ECMAScript leaves Math.pow/exp/log/trig implementation-approximated, so
    // any of them reintroduces exactly the drift H-002 describes.
    expect(offenders).toEqual([]);
  });

  it('uses no exponentiation operator, which is Math.pow by another name', () => {
    // This one has already fired for real: it found `10 ** decimals` inside
    // roundHalfUp — the mitigation ADR-009 added for H-002 (H-076).
    const offenders = files.filter((f) => /[^*]\*\*[^*]/.test(codeOnly(readFileSync(f, 'utf8'))));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('imports no inference runtime', () => {
    const banned = /onnxruntime|@huggingface\/transformers|@xenova\/transformers/;
    const offenders = files.filter((f) => banned.test(codeOnly(readFileSync(f, 'utf8'))));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('uses no Math.random', () => {
    const offenders = files.filter((f) =>
      codeOnly(readFileSync(f, 'utf8')).includes('Math.random'),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});
