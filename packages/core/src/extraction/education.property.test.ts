import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assertValidSpan } from './span.js';
import { extractEducation } from './education.js';

/**
 * Every degree-abbreviation form this extractor is meant to recognize,
 * across every DegreeLevel bucket, including the British-convention forms
 * that motivated this file (BSc, MSc, ...) and the ambiguous bare forms that
 * need corroborating context (BS, BA, MS, MA, MD, JD, AA, AS).
 */
const DEGREE_ABBREVIATIONS = [
  // bachelor
  'BSc',
  'B.Sc',
  'B.Sc.',
  'BS',
  'B.S.',
  'BA',
  'B.A.',
  'BEng',
  'B.Eng',
  'BBA',
  'BCom',
  'LLB',
  'BTech',
  'B.Tech',
  // master
  'MSc',
  'M.Sc',
  'M.Sc.',
  'MS',
  'M.S.',
  'MA',
  'M.A.',
  'MEng',
  'M.Eng',
  'MBA',
  'MPhil',
  'LLM',
  'MTech',
  // doctorate
  'PhD',
  'Ph.D.',
  'Ph.D',
  'DPhil',
  'EdD',
  'DSc',
  // professional
  'MD',
  'JD',
  // associate
  'AA',
  'AS',
  'A.A.',
  'A.S.',
] as const;

describe('extractEducation property tests', () => {
  it('every table abbreviation, embedded with degree context, yields exactly one education attribute with a valid span and no year/institution leakage', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DEGREE_ABBREVIATIONS),
        fc.integer({ min: 1950, max: 2099 }),
        (form, year) => {
          const text = `${form} in Computer Science, Example University, graduated ${String(year)}.`;
          const attrs = extractEducation(text);

          expect(attrs).toHaveLength(1);
          const attr = attrs[0];
          if (attr === undefined) throw new Error('unreachable: length asserted above');

          // Valid, in-bounds, matching span (Section 6.2 invariant).
          expect(() => {
            assertValidSpan(text, attr.sourceSpan, attr.value);
          }).not.toThrow();

          // ADR-007: never a graduation year or an institution name, in any field.
          const yearStr = String(year);
          expect(attr.value).not.toContain(yearStr);
          expect(attr.normalizedValue).not.toContain(yearStr);
          expect(String(attr.field)).not.toContain(yearStr);
          expect(attr.value.toLowerCase()).not.toContain('example university');
          expect(String(attr.field).toLowerCase()).not.toContain('example university');
        },
      ),
    );
  });

  it('is deterministic for every table abbreviation embedded with degree context', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DEGREE_ABBREVIATIONS), (form) => {
        const text = `${form} in Computer Science, Example University, graduated 2010.`;
        expect(extractEducation(text)).toEqual(extractEducation(text));
      }),
    );
  });
});
