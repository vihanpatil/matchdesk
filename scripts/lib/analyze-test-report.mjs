/**
 * Pure analysis of a Vitest JSON report. No I/O, so it can be unit tested.
 *
 * This is load-bearing for Section 0.2.2: it is the only check that survives
 * every skip mechanism, because it inspects what actually ran rather than the
 * shape of the source. Phase 0 verification defeated the first version twice —
 * once with `it.each([])` (a test that never registers is not "skipped", it
 * simply does not exist) and once with a stale report from a previous run.
 * Both are addressed here; staleness is additionally prevented by deleting the
 * report before each run.
 *
 * Every failure path is fail-CLOSED. A report this function cannot make sense
 * of is an error, never a pass.
 *
 * @typedef {{ status?: unknown, fullName?: unknown, title?: unknown }} Assertion
 * @typedef {{ name?: unknown, assertionResults?: unknown }} Suite
 * @typedef {{ code: 0 | 1 | 2, messages: string[], total: number }} Analysis
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

/** @param {unknown} value @returns {string} */
function asText(value) {
  return typeof value === 'string' && value.length > 0 ? value : '';
}

/**
 * Stable identity for a single test: repo-relative file + full test name.
 * @param {string} file
 * @param {string} name
 * @returns {string}
 */
export function testId(file, name) {
  const rel = file.includes('/matchdesk/') ? file.slice(file.indexOf('/matchdesk/') + 11) : file;
  return `${rel} :: ${name}`;
}

/**
 * Every test identity present in a report, sorted.
 * @param {unknown} report
 * @returns {string[]}
 */
export function collectTestIds(report) {
  if (!isRecord(report)) return [];
  const suites = report['testResults'];
  if (!Array.isArray(suites)) return [];
  /** @type {string[]} */
  const ids = [];
  for (const rawSuite of suites) {
    const suite = /** @type {Suite} */ (isRecord(rawSuite) ? rawSuite : {});
    const file = asText(suite.name) || '(unknown file)';
    const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    for (const rawAssertion of assertions) {
      const assertion = /** @type {Assertion} */ (isRecord(rawAssertion) ? rawAssertion : {});
      const name = asText(assertion.fullName) || asText(assertion.title) || '(unnamed test)';
      ids.push(testId(file, name));
    }
  }
  return ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * @param {unknown} report Parsed contents of Vitest's JSON reporter output.
 * @param {{ floor: number, manifest?: string[] }} options
 *        `floor` is a cheap lower bound; `manifest` is the authoritative list of
 *        test identities that must still exist. A count can be padded with
 *        filler tests to mask a deletion — Phase 0 verification demonstrated
 *        removing a named regression test, keeping the count at 30, and then
 *        shipping the exact mutant that test was written to catch. Identities
 *        cannot be padded: a missing test is named.
 * @returns {Analysis} code 0 = every test ran; 1 = a real violation;
 *          2 = the check itself could not be trusted.
 */
export function analyzeTestReport(report, { floor, manifest }) {
  if (!isRecord(report)) {
    return { code: 2, messages: ['Report is not an object.'], total: 0 };
  }
  const suites = report['testResults'];
  if (!Array.isArray(suites)) {
    return { code: 2, messages: ['Report has no testResults array.'], total: 0 };
  }
  if (suites.length === 0) {
    return {
      code: 2,
      messages: ['Report contains no test suites. Refusing to interpret that as success.'],
      total: 0,
    };
  }

  /** @type {string[]} */
  const messages = [];
  let counted = 0;

  for (const rawSuite of suites) {
    const suite = /** @type {Suite} */ (isRecord(rawSuite) ? rawSuite : {});
    const assertions = suite.assertionResults;
    if (!Array.isArray(assertions)) {
      return {
        code: 2,
        messages: [`Suite "${asText(suite.name) || '?'}" has no assertionResults array.`],
        total: 0,
      };
    }
    for (const rawAssertion of assertions) {
      counted += 1;
      const assertion = /** @type {Assertion} */ (isRecord(rawAssertion) ? rawAssertion : {});
      const status = asText(assertion.status) || 'unknown';
      if (status !== 'passed' && status !== 'failed') {
        const title = asText(assertion.fullName) || asText(assertion.title) || '(unnamed test)';
        const file = asText(suite.name) || '(unknown file)';
        messages.push(`  [${status}] ${title}\n           ${file}`);
      }
    }
  }

  // A forged or truncated report whose headline count disagrees with the
  // suites it actually contains is not trustworthy.
  const declared = report['numTotalTests'];
  if (typeof declared === 'number' && declared !== counted) {
    return {
      code: 2,
      messages: [
        `Report is internally inconsistent: numTotalTests=${String(declared)} but ${String(counted)} assertions are present.`,
      ],
      total: counted,
    };
  }

  if (counted === 0) {
    return { code: 2, messages: ['No tests were executed at all.'], total: 0 };
  }

  // The floor catches tests that vanished without ever registering — an empty
  // `it.each([])` array is lint-clean, typecheck-clean, and produces no skipped
  // test to detect. Only a drop in the absolute count reveals it.
  if (counted < floor) {
    return {
      code: 1,
      messages: [
        ...messages,
        `Test count fell to ${String(counted)}, below the committed floor of ${String(floor)}.`,
        'Tests disappeared without being reported as skipped — check for an empty it.each() array,',
        'a deleted file, or a suite that failed to register. If the drop is intentional, lower the',
        'floor in scripts/test-floor.json in the same commit, and say why in HONESTY_LOG.md.',
      ],
      total: counted,
    };
  }

  // Identity check. Additions are fine; disappearances are not.
  if (manifest !== undefined) {
    const present = new Set(collectTestIds(report));
    const missing = manifest.filter((id) => !present.has(id));
    if (missing.length > 0) {
      return {
        code: 1,
        messages: [
          ...messages,
          `${String(missing.length)} test(s) in the committed manifest no longer exist:`,
          ...missing.map((id) => `  - ${id}`),
          '',
          'A test was renamed, deleted, or failed to register. Adding filler tests cannot mask',
          'this, which is the point. If the removal is intentional, regenerate the manifest with',
          '`pnpm test:manifest` in the same commit and say why in HONESTY_LOG.md.',
        ],
        total: counted,
      };
    }
  }

  if (messages.length > 0) {
    return { code: 1, messages, total: counted };
  }

  return { code: 0, messages: [], total: counted };
}
