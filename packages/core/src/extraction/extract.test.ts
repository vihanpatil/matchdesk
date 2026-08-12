import { describe, expect, it } from 'vitest';

import { assertValidSpan } from './span.js';
import { extractAttributes } from './extract.js';

const REF = { referenceDate: { year: 2024, month: 6 } };

describe('extractAttributes', () => {
  it('combines skills, years_experience, education and certification attributes', () => {
    const text = [
      'Summary',
      '5+ years of experience building backend systems.',
      '',
      'Skills',
      'PostgreSQL, Python, Docker',
      '',
      'Education',
      "Bachelor's in Computer Science",
      '',
      'Certifications',
      'AWS Certified Solutions Architect',
    ].join('\n');

    const attrs = extractAttributes(text, REF);
    const kinds = new Set(attrs.map((a) => a.kind));
    expect(kinds).toEqual(new Set(['skill', 'years_experience', 'education', 'certification']));
  });

  it('returns attributes sorted by source span start, ascending', () => {
    const text = '5 years of experience with PostgreSQL. Bachelor of Science.';
    const attrs = extractAttributes(text, REF);
    for (let i = 1; i < attrs.length; i += 1) {
      const prev = attrs[i - 1];
      const curr = attrs[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      if (prev && curr) expect(curr.sourceSpan.start).toBeGreaterThanOrEqual(prev.sourceSpan.start);
    }
  });

  it('every attribute carries a valid, in-bounds span matching its value', () => {
    const text = [
      '5+ years of experience. PostgreSQL, Python, Docker, Kubernetes.',
      "Bachelor's in Computer Science, State University, 2015.",
      'PMP certified.',
    ].join('\n');
    const attrs = extractAttributes(text, REF);
    expect(attrs.length).toBeGreaterThan(0);
    for (const attr of attrs) {
      expect(() => {
        assertValidSpan(text, attr.sourceSpan, attr.value);
      }).not.toThrow();
    }
  });

  it('never emits an attribute containing a graduation year or institution name (ADR-007)', () => {
    const text =
      "Bachelor's in Computer Science, Massachusetts Institute of Technology, Graduated 2015.";
    const attrs = extractAttributes(text, REF);
    for (const attr of attrs) {
      if (attr.kind !== 'education') continue;
      expect(attr.value).not.toMatch(/\b(19|20)\d{2}\b/);
      expect(attr.value.toLowerCase()).not.toContain('massachusetts');
    }
  });

  it('returns an empty array for empty text', () => {
    expect(extractAttributes('', REF)).toEqual([]);
  });

  it('does not throw on a document with zero recognizable attributes', () => {
    expect(() =>
      extractAttributes('The quick brown fox jumps over the lazy dog.', REF),
    ).not.toThrow();
    expect(extractAttributes('The quick brown fox jumps over the lazy dog.', REF)).toEqual([]);
  });

  it('is deterministic across repeated calls', () => {
    const text = '5 years of experience with PostgreSQL. Bachelor of Science. PMP certified.';
    expect(extractAttributes(text, REF)).toEqual(extractAttributes(text, REF));
  });
});
