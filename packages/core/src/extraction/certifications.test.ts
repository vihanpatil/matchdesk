import { describe, expect, it } from 'vitest';

import { assertValidSpan } from './span.js';
import { extractCertifications } from './certifications.js';

describe('extractCertifications', () => {
  it('finds a recognized certification by its canonical label', () => {
    const text = 'Certified: AWS Certified Solutions Architect (2021).';
    const attrs = extractCertifications(text);
    expect(attrs.some((a) => a.canonicalId === 'aws-saa')).toBe(true);
  });

  it('finds a recognized certification by a known alias/abbreviation', () => {
    const text = 'PMP certified since 2019.';
    const attrs = extractCertifications(text);
    expect(attrs.some((a) => a.canonicalId === 'pmp')).toBe(true);
  });

  it('is case-insensitive', () => {
    const attrs = extractCertifications('cissp holder');
    expect(attrs.some((a) => a.canonicalId === 'cissp')).toBe(true);
  });

  it('does not match a certification abbreviation embedded in an unrelated word', () => {
    const attrs = extractCertifications('The itilization of resources was efficient.');
    expect(attrs.some((a) => a.canonicalId === 'itil')).toBe(false);
  });

  it('every emitted attribute carries a valid, matching span', () => {
    const text = 'PMP, CISSP and Six Sigma Green Belt certified.';
    const attrs = extractCertifications(text);
    expect(attrs.length).toBeGreaterThan(0);
    for (const attr of attrs) {
      expect(() => {
        assertValidSpan(text, attr.sourceSpan, attr.value);
      }).not.toThrow();
    }
  });

  it('returns an empty array when no certification is mentioned', () => {
    expect(extractCertifications('Enjoys hiking and reading on weekends.')).toEqual([]);
  });

  it('returns an empty array for empty text', () => {
    expect(extractCertifications('')).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    const text = 'PMP and AWS Certified Solutions Architect.';
    expect(extractCertifications(text)).toEqual(extractCertifications(text));
  });

  it('does not double-count overlapping mentions, preferring the longer match', () => {
    const text = 'AWS Certified Solutions Architect certification earned in 2021.';
    const attrs = extractCertifications(text);
    const awsMatches = attrs.filter((a) => a.canonicalId === 'aws-saa');
    expect(awsMatches).toHaveLength(1);
  });
});
