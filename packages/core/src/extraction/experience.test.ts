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

/**
 * BOUNDARY AND VOCABULARY COVERAGE (ADR-023 E4 / H-057).
 *
 * Mutation testing left 97 survivors here, clustered in three places: the
 * NON_EMPLOYMENT_CONTEXT quantity-word list (15 mutants — every word could be
 * deleted with no test noticing), the date-parsing month/year guards, and the
 * plausibility bounds. Each one decides how many years of experience a real
 * candidate is credited with.
 */
describe('quantity vocabulary is pinned, word by word (H-028 D5c / H-057)', () => {
  // Every word in NON_EMPLOYMENT_CONTEXT exists to stop a quantity range being
  // read as employment ("budget of 2000 - 2024"). A mutant deleting any single
  // word silently re-opens D5c for CVs that happen to use that word — and
  // "increased revenue 2015 - 2019" is an utterly ordinary CV line.
  const QUANTITY_WORDS = [
    'budget',
    'users',
    'revenue',
    'sales',
    'population',
    'customers',
    'subscribers',
    'followers',
    'downloads',
    'requests',
    'transactions',
    'records',
    'dollars',
    'USD',
    'GBP',
    'EUR',
    'points',
    'score',
    'rating',
    'impressions',
    'visitors',
    'clicks',
    'views',
    'installs',
    'accounts',
    'licenses',
    'percent',
    'shares',
    'units',
  ];

  it.each(QUANTITY_WORDS)(
    '"%s" near a bare year range prevents it counting as employment',
    (word) => {
      const attrs = extractYearsExperience(`Grew ${word} from 2000 - 2024.`, REF);
      expect(attrs.some((a) => a.value.includes('2000'))).toBe(false);
    },
  );

  it('applies the quantity guard when the word comes AFTER the range too', () => {
    const attrs = extractYearsExperience('Handled 2000 - 2024 transactions.', REF);
    expect(attrs.some((a) => a.value.includes('2000'))).toBe(false);
  });

  it('does NOT apply the quantity guard to an unambiguous month-qualified range', () => {
    // "Jan 2019 - Mar 2022" is a date range whatever surrounds it; only a BARE
    // year range is ambiguous enough to need the guard. A mutant widening the
    // guard would silently delete real employment.
    const attrs = extractYearsExperience(
      'Managed a budget of 5M. Senior Engineer, Jan 2019 - Mar 2022',
      REF,
    );
    expect(attrs.some((a) => a.value.includes('Jan 2019'))).toBe(true);
  });
});

describe('date parsing boundaries (H-057)', () => {
  it('accepts month 1 and month 12, and rejects month 0 and month 13', () => {
    // Pins `month >= 1 && month <= 12` against every off-by-one mutation.
    expect(extractYearsExperience('Engineer 1/2015 - 12/2018', REF).length).toBeGreaterThan(0);
    expect(extractYearsExperience('Engineer 0/2015 - 12/2018', REF)).toEqual([]);
    expect(extractYearsExperience('Engineer 1/2015 - 13/2018', REF)).toEqual([]);
  });

  it('KNOWN LIMITATION: a month name is not word-boundary anchored at its start', () => {
    // `MONTH_PATTERN` has no leading \b, so a word ENDING in a month name and
    // immediately followed by a year parses as a date: "Smarch 2015" matches
    // "march 2015". Asserted as CURRENT BEHAVIOUR, not endorsed.
    //
    // Impact measured before recording it as low rather than assuming: it
    // needs the month to be the word's final letters AND a year to follow
    // immediately. Realistic near-misses do NOT trigger it — "Hollis
    // Marchetti 2015 - Dec 2018" matches the BARE year "2015", which is
    // intended behaviour, because "march" there is followed by "etti".
    // A lost space in PDF extraction ("ProjectMarch 2015") is the plausible
    // case, and there the match is arguably correct.
    const attrs = extractYearsExperience('Engineer, Smarch 2015 - Dec 2018', REF);
    expect(attrs[0]?.value).toBe('march 2015 - Dec 2018');
  });

  it('a name containing a month does not shift which token starts the range', () => {
    // The realistic version of the case above: the range starts at the bare
    // year, not inside the surname.
    const attrs = extractYearsExperience('Hollis Marchetti 2015 - Dec 2018', REF);
    expect(attrs[0]?.value).toBe('2015 - Dec 2018');
  });

  it('rejects a range whose end precedes its start', () => {
    expect(extractYearsExperience('Engineer, Jan 2020 - Jan 2015', REF)).toEqual([]);
  });

  it('rejects a zero-length range', () => {
    expect(extractYearsExperience('Engineer, Jan 2020 - Jan 2020', REF)).toEqual([]);
  });
});

describe('plausibility bounds (H-057)', () => {
  it('rejects a range longer than the maximum plausible career', () => {
    // Pins `years > MAX_PLAUSIBLE_YEARS` against `>=` and `<` mutations: a
    // 61-year single role is noise (usually a typo'd year), a 59-year one is
    // implausible but is not this guard's business to reject.
    expect(extractYearsExperience('Engineer, Jan 1950 - Jan 2020', REF)).toEqual([]);
  });

  it('accepts a long but plausible career', () => {
    const attrs = extractYearsExperience('Engineer, Jan 1980 - Jan 2020', REF);
    expect(attrs.length).toBeGreaterThan(0);
  });

  it('rejects an explicit claim beyond the plausible maximum', () => {
    expect(extractYearsExperience('I have 99 years of experience.', REF)).toEqual([]);
  });

  it('accepts an explicit claim at the low end', () => {
    const attrs = extractYearsExperience('1 year of experience.', REF);
    expect(attrs.length).toBeGreaterThan(0);
  });
});

describe('unambiguous numeric date formats (B.4)', () => {
  // These pin the B.4 fix. Before it, `DATE_TOKEN` had no three-part numeric
  // alternative, so `13/04/2019` matched only the trailing `04/2019` and
  // `13-04-2019` matched only the trailing `2019` (defaulting to January).
  // Verified to fail without the fix by reverting experience.ts and re-running.
  //
  // The rule is the one fact that holds in every locale: a number in 13-31
  // cannot be a month, so the OTHER number must be. Nothing here guesses a
  // locale — see the DOCUMENTED GAP below for what stays unresolved.

  it('parses a full DD/MM/YYYY range on both sides', () => {
    // Was `[]` — the whole role vanished and contributed zero years.
    const attrs = extractYearsExperience('Engineer, Acme, 13/04/2019 - 15/08/2022', REF);
    expect(attrs.length).toBeGreaterThan(0);
    expect(attrs[0]?.years).toBe(3.3);
  });

  it('parses a full DD-MM-YYYY range on both sides', () => {
    // Dash separator was strictly worse than slash: it fell all the way back
    // to the bare `\d{4}` alternative.
    const attrs = extractYearsExperience('Engineer, Acme, 13-04-2019 - 15-08-2022', REF);
    expect(attrs.length).toBeGreaterThan(0);
    expect(attrs[0]?.years).toBe(3.3);
  });

  it('reads the month from the non-day side regardless of which side it is on', () => {
    // DD/MM (Indian/European) and MM/DD (US) must both resolve to April 2019.
    const indian = extractYearsExperience('Engineer, Acme, 13/04/2019 - 13/04/2021', REF);
    const us = extractYearsExperience('Engineer, Acme, 04/13/2019 - 04/13/2021', REF);
    expect(indian[0]?.years).toBe(2);
    expect(us[0]?.years).toBe(2);
  });

  it('does not match when neither leading number can be a day', () => {
    // "13/25/2019" has no valid month on either side; it must not be trusted
    // as a date. Pins the `month >= 1 && month <= 12` check in parseDateToken.
    const attrs = extractYearsExperience('Engineer, Acme, 13/25/2019 - 13/25/2021', REF);
    expect(attrs).toEqual([]);
  });

  // ── DOCUMENTED GAPS ────────────────────────────────────────────────────
  // All four assert the WRONG behaviour on purpose so it cannot be lost
  // (H-085's lesson). An earlier version of this block had only the first and
  // described the defect as "a two-sided ambiguous range is dropped". An
  // independent verifier falsified that description on three counts (H-094);
  // the other three tests below are those counts, pinned.

  it('DOCUMENTED GAP (H-089): an ambiguous END date deletes the role', () => {
    // Not "both sides ambiguous" — the END governs. An unambiguous start with
    // an ambiguous end is dropped just the same, which makes the affected
    // population 336/784 day-pairs rather than the 144/784 the original
    // description implied.
    expect(extractYearsExperience('Engineer, Acme, 03/04/2019 - 05/08/2022', REF)).toEqual([]);
    expect(extractYearsExperience('Engineer, Acme, 13/04/2013 - 05/08/2022', REF)).toEqual([]);
  });

  it('DOCUMENTED GAP (H-089): an open-ended ambiguous range silently GUESSES DD/MM', () => {
    // This is the correction that matters most. The range does NOT abstain:
    // the 3-part token fails, then `\d{1,2}\/\d{4}` matches a SUBSTRING,
    // discarding the leading component. The engine commits to a locale by
    // accident, and truncates the evidence span the recruiter is shown.
    const attrs = extractYearsExperience('Engineer, Acme, 03/04/2019 - Present', REF);
    expect(attrs[0]?.years).toBe(5.2);
    expect(attrs[0]?.value).toBe('04/2019 - Present');

    // The same fallback reads a US-notation date as DD/MM: "04/03/2013" is
    // 4 March to a US author, and the engine reports March — right answer,
    // wrong reasoning, and it would be wrong for an Indian author.
    expect(extractYearsExperience('Engineer, Acme, 04/03/2013 - Present', REF)[0]?.value).toBe(
      '03/2013 - Present',
    );
  });

  it('DOCUMENTED GAP (H-095): dash and dot separators silently OVER-count', () => {
    // Directionally opposite to H-089 and previously unregistered. The
    // slash-only `\d{1,2}\/\d{4}` alternative cannot match a dash or dot
    // form, so it falls all the way to bare `\d{4}` and defaults to January —
    // inflating tenure and truncating the evidence to just the year.
    for (const sep of ['-', '.']) {
      const attrs = extractYearsExperience(`Engineer, Acme, 03${sep}04${sep}2013 - Present`, REF);
      expect(attrs[0]?.years).toBe(11.4); // truth is 11.2 — April, not January
      expect(attrs[0]?.value).toBe('2013 - Present');
    }
  });
});
