import { describe, expect, it } from 'vitest';

import { analyzeTestReport } from './analyze-test-report.mjs';

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
