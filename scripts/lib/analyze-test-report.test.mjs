import { describe, expect, it } from 'vitest';

import { analyzeTestReport, collectTestIds, testId } from './analyze-test-report.mjs';

/**
 * Builds a minimal report with `statuses.length` assertions in one suite.
 * @param {string[]} statuses
 * @param {Record<string, unknown>} [overrides]
 */
function report(statuses, overrides = {}) {
  const assertionResults = statuses.map((status, i) => ({
    status,
    fullName: `test ${String(i)}`,
    title: `test ${String(i)}`,
  }));
  return {
    numTotalTests: assertionResults.length,
    testResults: [{ name: '/repo/some.test.ts', assertionResults }],
    ...overrides,
  };
}

const OK = { floor: 0 };

describe('analyzeTestReport', () => {
  it('passes when every test genuinely ran', () => {
    const result = analyzeTestReport(report(['passed', 'passed', 'failed']), OK);
    expect(result.code).toBe(0);
    expect(result.total).toBe(3);
  });

  it('rejects a skipped test', () => {
    const result = analyzeTestReport(report(['passed', 'skipped']), OK);
    expect(result.code).toBe(1);
    expect(result.messages.join('\n')).toContain('[skipped]');
  });

  it('rejects todo and pending statuses, not only "skipped"', () => {
    expect(analyzeTestReport(report(['passed', 'todo']), OK).code).toBe(1);
    expect(analyzeTestReport(report(['passed', 'pending']), OK).code).toBe(1);
  });

  it('rejects a test count below the committed floor', () => {
    // The it.each([]) case: tests vanish without ever registering, so nothing
    // is marked skipped and only the absolute count reveals the loss.
    const result = analyzeTestReport(report(['passed']), { floor: 20 });
    expect(result.code).toBe(1);
    expect(result.messages.join('\n')).toContain('below the committed floor');
  });

  it('passes when the count exactly meets the floor', () => {
    expect(analyzeTestReport(report(['passed', 'passed']), { floor: 2 }).code).toBe(0);
  });

  it('fails closed on a forged report whose headline count has no suites behind it', () => {
    const forged = { numTotalTests: 20, testResults: [] };
    expect(analyzeTestReport(forged, OK).code).toBe(2);
  });

  it('fails closed when numTotalTests disagrees with the assertions present', () => {
    const inconsistent = report(['passed', 'passed'], { numTotalTests: 20 });
    const result = analyzeTestReport(inconsistent, OK);
    expect(result.code).toBe(2);
    expect(result.messages.join('\n')).toContain('internally inconsistent');
  });

  it('fails closed on a structurally invalid report', () => {
    expect(analyzeTestReport(null, OK).code).toBe(2);
    expect(analyzeTestReport({}, OK).code).toBe(2);
    expect(analyzeTestReport({ testResults: 'nope' }, OK).code).toBe(2);
    expect(analyzeTestReport({ testResults: [{ name: 'x' }] }, OK).code).toBe(2);
  });

  it('fails closed when suites exist but contain no assertions', () => {
    const empty = { numTotalTests: 0, testResults: [{ name: 'x', assertionResults: [] }] };
    expect(analyzeTestReport(empty, OK).code).toBe(2);
  });

  it('names a manifest test that has disappeared', () => {
    // The R-1 attack: delete a named regression test, add a filler test so the
    // count is unchanged. A floor cannot see this; identities can.
    const result = analyzeTestReport(report(['passed', 'passed']), {
      floor: 2,
      manifest: ['/repo/some.test.ts :: test 0', '/repo/some.test.ts :: deleted regression test'],
    });
    expect(result.code).toBe(1);
    expect(result.messages.join('\n')).toContain('deleted regression test');
    expect(result.messages.join('\n')).toContain('no longer exist');
  });

  it('permits added tests without complaint', () => {
    const result = analyzeTestReport(report(['passed', 'passed', 'passed']), {
      floor: 0,
      manifest: ['/repo/some.test.ts :: test 0'],
    });
    expect(result.code).toBe(0);
  });

  it('still rejects a skip even when the manifest is satisfied', () => {
    const result = analyzeTestReport(report(['passed', 'skipped']), {
      floor: 0,
      manifest: [],
    });
    expect(result.code).toBe(1);
    expect(result.messages.join('\n')).toContain('[skipped]');
  });

  it('counts across multiple suites', () => {
    const multi = {
      numTotalTests: 3,
      testResults: [
        { name: 'a', assertionResults: [{ status: 'passed', title: 'a1' }] },
        {
          name: 'b',
          assertionResults: [
            { status: 'passed', title: 'b1' },
            { status: 'skipped', title: 'b2' },
          ],
        },
      ],
    };
    const result = analyzeTestReport(multi, OK);
    expect(result.total).toBe(3);
    expect(result.code).toBe(1);
  });
});

describe('test identities', () => {
  it('builds a stable id from repo-relative path and full name', () => {
    expect(testId('/x/matchdesk/packages/core/a.test.ts', 'suite does thing')).toBe(
      'packages/core/a.test.ts :: suite does thing',
    );
  });

  it('leaves paths outside the repo root intact', () => {
    expect(testId('/elsewhere/a.test.ts', 'n')).toBe('/elsewhere/a.test.ts :: n');
  });

  it('collects every id, sorted and deterministic', () => {
    const r = {
      numTotalTests: 2,
      testResults: [
        { name: '/x/matchdesk/b.test.ts', assertionResults: [{ status: 'passed', fullName: 'z' }] },
        { name: '/x/matchdesk/a.test.ts', assertionResults: [{ status: 'passed', fullName: 'y' }] },
      ],
    };
    expect(collectTestIds(r)).toEqual(['a.test.ts :: y', 'b.test.ts :: z']);
  });

  it('returns nothing for a structurally invalid report rather than throwing', () => {
    expect(collectTestIds(null)).toEqual([]);
    expect(collectTestIds({})).toEqual([]);
    expect(collectTestIds({ testResults: 'no' })).toEqual([]);
  });
});
