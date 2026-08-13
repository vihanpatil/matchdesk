import { describe, expect, it } from 'vitest';

import { roundHalfUp } from '../numeric/round.js';
import { assertValidSpan } from './span.js';
import { extractYearsExperience } from './experience.js';

const REF = { year: 2024, month: 6 };

describe('extractYearsExperience', () => {
  it('parses an explicit "X years of experience" statement', () => {
    const text = 'I have 5+ years of experience in software engineering.';
    const attrs = extractYearsExperience(text, REF);
    expect(attrs).toHaveLength(1);
    expect(attrs[0]?.years).toBe(5);
    expect(attrs[0]?.normalizedValue).toBe('5');
  });

  it('parses "X years" without the trailing "of experience"', () => {
    const attrs = extractYearsExperience('3 years experience with PostgreSQL.', REF);
    expect(attrs.some((a) => a.years === 3)).toBe(true);
  });

  it('parses a whole-year date range into a duration in years', () => {
    const text = 'Senior Engineer, Acme Corp, Jan 2019 - Jan 2022';
    const attrs = extractYearsExperience(text, REF);
    const dateAttr = attrs.find((a) => a.value.includes('Jan 2019'));
    expect(dateAttr).toBeDefined();
    expect(dateAttr?.years).toBe(3);
  });

  it('resolves "Present" against the supplied reference date', () => {
    const text = 'Engineer, Acme Corp, 2019 - Present';
    const attrs = extractYearsExperience(text, { year: 2022, month: 1 });
    const dateAttr = attrs.find((a) => a.value.toLowerCase().includes('present'));
    expect(dateAttr).toBeDefined();
    expect(dateAttr?.years).toBe(3);
  });

  it('parses numeric MM/YYYY date ranges', () => {
    const text = 'Engineer, Acme Corp, 06/2019 - 09/2021';
    const attrs = extractYearsExperience(text, REF);
    const dateAttr = attrs.find((a) => a.value.includes('06/2019'));
    expect(dateAttr).toBeDefined();
    const months = (2021 - 2019) * 12 + (9 - 6);
    expect(dateAttr?.years).toBe(roundHalfUp(months / 12, 1));
  });

  it('rejects an out-of-range numeric month (e.g. 13) as an unparseable date', () => {
    const text = 'Engineer, Acme Corp, 13/2019 - 09/2021';
    const attrs = extractYearsExperience(text, REF);
    expect(attrs.some((a) => a.value.includes('13/2019'))).toBe(false);
  });

  it('applies half-up rounding (via roundHalfUp) to a fractional-year duration', () => {
    const text = 'Engineer, Acme Corp, Jan 2019 - Mar 2022';
    const attrs = extractYearsExperience(text, REF);
    const dateAttr = attrs.find((a) => a.value.includes('Jan 2019'));
    const months = (2022 - 2019) * 12 + (3 - 1);
    expect(dateAttr?.years).toBe(roundHalfUp(months / 12, 1));
  });

  it('gives an explicit "years of experience" statement higher confidence than a parsed date range', () => {
    const statement = extractYearsExperience('I have 6 years of experience.', REF)[0];
    const range = extractYearsExperience('Engineer, Acme Corp, Jan 2019 - Jan 2022', REF).find(
      (a) => a.value.includes('Jan 2019'),
    );
    expect(statement?.confidence).toBeGreaterThan(range?.confidence ?? 1);
  });

  it('does not extract a date range that falls inside the Education section', () => {
    const text = [
      'Experience',
      'Engineer, Acme Corp, Jan 2019 - Jan 2021',
      '',
      'Education',
      'B.Sc. 2015 - 2019',
    ].join('\n');
    const attrs = extractYearsExperience(text, REF);
    expect(attrs.some((a) => a.value.includes('2015'))).toBe(false);
    expect(attrs.some((a) => a.value.includes('Jan 2019'))).toBe(true);
  });

  it('every emitted attribute carries a valid, matching span', () => {
    const text = 'I have 5 years of experience. Engineer, Acme Corp, Jan 2019 - Jan 2022.';
    const attrs = extractYearsExperience(text, REF);
    expect(attrs.length).toBeGreaterThan(0);
    for (const attr of attrs) {
      expect(() => {
        assertValidSpan(text, attr.sourceSpan, attr.value);
      }).not.toThrow();
    }
  });

  it('does not throw on malformed or nonsensical date-like text', () => {
    expect(() => extractYearsExperience('Feb 9999 - Blorp 0000', REF)).not.toThrow();
    expect(() => extractYearsExperience('99 years 88 months of nonsense', REF)).not.toThrow();
  });

  it('is deterministic across repeated calls', () => {
    const text = '5 years of experience. Engineer, Jan 2019 - Jan 2022.';
    expect(extractYearsExperience(text, REF)).toEqual(extractYearsExperience(text, REF));
  });

  it('returns an empty array for empty text', () => {
    expect(extractYearsExperience('', REF)).toEqual([]);
  });

  it('returns an empty array when there is no experience signal at all', () => {
    expect(extractYearsExperience('A short bio with no numbers or dates.', REF)).toEqual([]);
  });

  // H-028 D5c: a bare YYYY - YYYY range describing a quantity (budget, user
  // count, ...) is not an employment date range and must not be counted.
  it('does not parse "budget of 2000 - 2024 USD" as an employment date range (D5c)', () => {
    const attrs = extractYearsExperience('Managed a budget of 2000 - 2024 USD.', REF);
    expect(attrs.some((a) => a.value.includes('2000'))).toBe(false);
  });

  it('does not parse "Grew active users from 2015 - 2019" as an employment date range (D5c)', () => {
    const attrs = extractYearsExperience('Grew active users from 2015 - 2019.', REF);
    expect(attrs.some((a) => a.value.includes('2015'))).toBe(false);
  });

  it('still parses a genuine bare-year employment range with no quantity context', () => {
    const text = 'Work History\nSoftware Engineer, Acme Corp\n2016 - 2019';
    const attrs = extractYearsExperience(text, REF);
    expect(attrs.some((a) => a.value.includes('2016'))).toBe(true);
  });

  // H-028 D5b (interval-merge half): concurrent/overlapping roles must not
  // each contribute their full duration to the total.
  it('does not double-count two overlapping employment date ranges', () => {
    const text = [
      'Senior Engineer, Acme Corp, Jan 2019 - Jan 2022',
      'Consultant, Beta Inc, Jun 2020 - Jun 2021',
    ].join('\n');
    const attrs = extractYearsExperience(text, REF);
    const total = attrs.reduce((acc, a) => acc + a.years, 0);
    // True merged coverage is Jan 2019 - Jan 2022 = 3 years, NOT 3 + 1 = 4.
    expect(total).toBe(3);
  });

  it('credits the full duration of two non-overlapping (adjacent) ranges', () => {
    const text = ['Jan 2012 - Dec 2015', 'Jan 2016 - Jan 2020'].join('\n');
    const attrs = extractYearsExperience(text, REF);
    const total = attrs.reduce((acc, a) => acc + a.years, 0);
    expect(total).toBeCloseTo(3.9 + 4, 1);
  });

  it('rejects a range that starts in the future relative to the reference date', () => {
    const attrs = extractYearsExperience('Engineer, Acme Corp, Jan 2030 - Jan 2032', REF);
    expect(attrs).toHaveLength(0);
  });

  it('marks an explicit "years of experience" statement as such', () => {
    const attrs = extractYearsExperience('I have 6 years of experience.', REF);
    expect(attrs[0]?.isExplicitStatement).toBe(true);
  });

  it('does not mark a parsed date range as an explicit statement', () => {
    const attrs = extractYearsExperience('Engineer, Acme Corp, Jan 2019 - Jan 2022', REF);
    expect(attrs.every((a) => a.isExplicitStatement !== true)).toBe(true);
  });
});
