import { describe, expect, it } from 'vitest';

import { assertValidSpan } from './span.js';
import { extractEducation } from './education.js';

describe('extractEducation', () => {
  it('detects a bachelor degree level from "Bachelor\'s"', () => {
    const attrs = extractEducation(
      "Bachelor's in Computer Science, University of Springfield, 2015.",
    );
    expect(attrs).toHaveLength(1);
    expect(attrs[0]?.degreeLevel).toBe('bachelor');
  });

  it('detects a master degree level from "M.S."', () => {
    const attrs = extractEducation('M.S. in Data Science, Springfield University.');
    expect(attrs.some((a) => a.degreeLevel === 'master')).toBe(true);
  });

  it('detects a doctorate from "PhD"', () => {
    const attrs = extractEducation('PhD in Electrical Engineering.');
    expect(attrs.some((a) => a.degreeLevel === 'doctorate')).toBe(true);
  });

  it('detects an associate degree', () => {
    const attrs = extractEducation("Associate's Degree in Business Administration.");
    expect(attrs.some((a) => a.degreeLevel === 'associate')).toBe(true);
  });

  it('detects a high school diploma', () => {
    const attrs = extractEducation('High School Diploma.');
    expect(attrs.some((a) => a.degreeLevel === 'high_school')).toBe(true);
  });

  it('extracts a recognized field of study, canonicalized', () => {
    const attrs = extractEducation("Bachelor's in Computer Science.");
    expect(attrs[0]?.field).toBe('computer-science');
  });

  it('sets field to null when no recognized field is stated', () => {
    const attrs = extractEducation('Bachelor of Arts.');
    expect(attrs[0]?.degreeLevel).toBe('bachelor');
    expect(attrs[0]?.field).toBeNull();
  });

  it('NEVER includes an institution name in value, normalizedValue or field (ADR-007)', () => {
    const attrs = extractEducation(
      "Bachelor's in Computer Science, Massachusetts Institute of Technology, 2015.",
    );
    for (const attr of attrs) {
      expect(attr.value.toLowerCase()).not.toContain('massachusetts');
      expect(attr.value.toLowerCase()).not.toContain('institute of technology');
      expect(attr.normalizedValue.toLowerCase()).not.toContain('massachusetts');
      expect(String(attr.field).toLowerCase()).not.toContain('massachusetts');
    }
  });

  it('NEVER extracts a graduation year into any field of the attribute (ADR-007)', () => {
    const attrs = extractEducation(
      "Bachelor's in Computer Science, State University, Graduated 2018.",
    );
    for (const attr of attrs) {
      expect(attr.value).not.toMatch(/\b(19|20)\d{2}\b/);
      expect(attr.normalizedValue).not.toMatch(/\b(19|20)\d{2}\b/);
      expect(String(attr.field)).not.toMatch(/\b(19|20)\d{2}\b/);
    }
  });

  it('does not double-count a shorter degree pattern embedded inside a longer overlapping match', () => {
    // "M.B.A." is claimed whole by the master pattern; "B.A." embedded
    // inside it must not also register as a separate bachelor attribute.
    const attrs = extractEducation('M.B.A. from a top program.');
    expect(attrs).toHaveLength(1);
    expect(attrs[0]?.degreeLevel).toBe('master');
  });

  it('detects multiple degrees mentioned in the same document', () => {
    const text = ["Bachelor's in Computer Science, 2012.", "Master's in Data Science, 2015."].join(
      '\n',
    );
    const attrs = extractEducation(text);
    expect(
      attrs.map((a) => a.degreeLevel).toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ).toEqual(['bachelor', 'master']);
  });

  it('every emitted attribute carries a valid, matching span', () => {
    const text = "Bachelor's in Computer Science, State University, 2015.";
    const attrs = extractEducation(text);
    for (const attr of attrs) {
      expect(() => {
        assertValidSpan(text, attr.sourceSpan, attr.value);
      }).not.toThrow();
    }
  });

  it('is case-insensitive', () => {
    expect(extractEducation('bachelor of science in computer science')[0]?.degreeLevel).toBe(
      'bachelor',
    );
  });

  it('is deterministic across repeated calls', () => {
    const text = "Bachelor's in Computer Science, 2015.";
    expect(extractEducation(text)).toEqual(extractEducation(text));
  });

  it('returns an empty array for empty text', () => {
    expect(extractEducation('')).toEqual([]);
  });

  it('returns an empty array when no degree is mentioned', () => {
    expect(extractEducation('Worked at a bakery for five years.')).toEqual([]);
  });
});
