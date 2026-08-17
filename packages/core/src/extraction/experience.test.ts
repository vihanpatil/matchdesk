import { describe, expect, it } from 'vitest';

import { quantize } from '../numeric/round.js';
import { assertValidSpan } from './span.js';
import { extractYearsExperience } from './experience.js';
import type { YearsExperienceAttribute } from './types.js';

const REF = { year: 2024, month: 6 };
/** The reference date used throughout H-095/H-101/H-102/H-103/H-104/H-107's
 *  own measured tables (tiger-team brief), so the numbers here line up with
 *  what was reported. */
const REF_2026 = { year: 2026, month: 8 };

/**
 * `extractYearsExperience` can also emit `unreadable_date_range` attributes
 * (E3, ADR-029) alongside `years_experience` ones, and the two kinds do not
 * share `years`/`isExplicitStatement` (H-089/H-095's remedy is a distinct
 * attribute shape, not a `years_experience` with a flag on it — see
 * `./types.js`). Narrows to the `years_experience` kind, which is what every
 * test in this file is about UNLESS it explicitly says otherwise (the E2/E3
 * ambiguous-date tests near the end assert on `unreadable_date_range`
 * directly, since that is the behaviour under test there).
 */
function years(
  attrs: ReturnType<typeof extractYearsExperience>,
): readonly YearsExperienceAttribute[] {
  return attrs.filter((a): a is YearsExperienceAttribute => a.kind === 'years_experience');
}

describe('extractYearsExperience', () => {
  it('parses an explicit "X years of experience" statement', () => {
    const text = 'I have 5+ years of experience in software engineering.';
    const attrs = extractYearsExperience(text, REF);
    expect(attrs).toHaveLength(1);
    expect(years(attrs)[0]?.years).toBe(5);
    expect(attrs[0]?.normalizedValue).toBe('5');
  });

  it('parses "X years" without the trailing "of experience"', () => {
    const attrs = extractYearsExperience('3 years experience with PostgreSQL.', REF);
    expect(years(attrs).some((a) => a.years === 3)).toBe(true);
  });

  it('parses a whole-year date range into a duration in years', () => {
    const text = 'Senior Engineer, Acme Corp, Jan 2019 - Jan 2022';
    const attrs = extractYearsExperience(text, REF);
    const dateAttr = years(attrs).find((a) => a.value.includes('Jan 2019'));
    expect(dateAttr).toBeDefined();
    expect(dateAttr?.years).toBe(3);
  });

  it('resolves "Present" against the supplied reference date', () => {
    const text = 'Engineer, Acme Corp, 2019 - Present';
    const attrs = extractYearsExperience(text, { year: 2022, month: 1 });
    const dateAttr = years(attrs).find((a) => a.value.toLowerCase().includes('present'));
    expect(dateAttr).toBeDefined();
    expect(dateAttr?.years).toBe(3);
  });

  it('parses numeric MM/YYYY date ranges', () => {
    const text = 'Engineer, Acme Corp, 06/2019 - 09/2021';
    const attrs = extractYearsExperience(text, REF);
    const dateAttr = years(attrs).find((a) => a.value.includes('06/2019'));
    expect(dateAttr).toBeDefined();
    const months = (2021 - 2019) * 12 + (9 - 6);
    // H-104: per-range years is the exact fraction, quantized to 6dp — NOT
    // rounded to 1dp — because rounding here, before a later sum, is what
    // inflated tenure by up to ~20% across many small ranges.
    expect(dateAttr?.years).toBe(quantize(months / 12));
  });

  it('rejects an out-of-range numeric month (e.g. 13) as an unparseable date', () => {
    const text = 'Engineer, Acme Corp, 13/2019 - 09/2021';
    const attrs = extractYearsExperience(text, REF);
    expect(attrs.some((a) => a.value.includes('13/2019'))).toBe(false);
  });

  it('carries the exact fraction of a fractional-year duration, quantized once (H-104)', () => {
    // Previously titled "applies half-up rounding (via roundHalfUp) to a
    // fractional-year duration" and asserted `roundHalfUp(months/12, 1)` —
    // that PER-RANGE 1dp rounding is the H-104 defect. Renamed and flipped
    // per ADR-028 (pin what is now correct, do not delete the history).
    const text = 'Engineer, Acme Corp, Jan 2019 - Mar 2022';
    const attrs = extractYearsExperience(text, REF);
    const dateAttr = years(attrs).find((a) => a.value.includes('Jan 2019'));
    const months = (2022 - 2019) * 12 + (3 - 1);
    expect(dateAttr?.years).toBe(quantize(months / 12));
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
    const total = years(attrs).reduce((acc, a) => acc + a.years, 0);
    // True merged coverage is Jan 2019 - Jan 2022 = 3 years, NOT 3 + 1 = 4.
    expect(total).toBe(3);
  });

  it('credits the full duration of two non-overlapping (adjacent) ranges', () => {
    const text = ['Jan 2012 - Dec 2015', 'Jan 2016 - Jan 2020'].join('\n');
    const attrs = extractYearsExperience(text, REF);
    const total = years(attrs).reduce((acc, a) => acc + a.years, 0);
    expect(total).toBeCloseTo(3.9 + 4, 1);
  });

  it('rejects a range that starts in the future relative to the reference date', () => {
    const attrs = extractYearsExperience('Engineer, Acme Corp, Jan 2030 - Jan 2032', REF);
    expect(attrs).toHaveLength(0);
  });

  it('marks an explicit "years of experience" statement as such', () => {
    const attrs = extractYearsExperience('I have 6 years of experience.', REF);
    expect(years(attrs)[0]?.isExplicitStatement).toBe(true);
  });

  it('does not mark a parsed date range as an explicit statement', () => {
    const attrs = extractYearsExperience('Engineer, Acme Corp, Jan 2019 - Jan 2022', REF);
    expect(years(attrs).every((a) => a.isExplicitStatement !== true)).toBe(true);
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

  // truth: April 2019 - August 2022 = 40 months = 3.3333...y exactly. Was
  // hardcoded to `3.3` (the OLD per-range-rounded value); H-104 carries the
  // exact fraction now, so these compute the expectation instead.
  const DD_MM_TRUTH_MONTHS = (2022 - 2019) * 12 + (8 - 4);

  it('parses a full DD/MM/YYYY range on both sides', () => {
    // Was `[]` — the whole role vanished and contributed zero years.
    const attrs = extractYearsExperience('Engineer, Acme, 13/04/2019 - 15/08/2022', REF);
    expect(attrs.length).toBeGreaterThan(0);
    expect(years(attrs)[0]?.years).toBe(quantize(DD_MM_TRUTH_MONTHS / 12));
  });

  it('parses a full DD-MM-YYYY range on both sides', () => {
    // Dash separator was strictly worse than slash: it fell all the way back
    // to the bare `\d{4}` alternative.
    const attrs = extractYearsExperience('Engineer, Acme, 13-04-2019 - 15-08-2022', REF);
    expect(attrs.length).toBeGreaterThan(0);
    expect(years(attrs)[0]?.years).toBe(quantize(DD_MM_TRUTH_MONTHS / 12));
  });

  it('parses a full DD.MM.YYYY range on both sides (E1: the dot separator is new)', () => {
    // Before E1, DATE_TOKEN had no dot-separated three-part alternative at
    // all, so this fell to the bare `\d{4}` fallback on both sides.
    const attrs = extractYearsExperience('Engineer, Acme, 13.04.2019 - 15.08.2022', REF);
    expect(attrs.length).toBeGreaterThan(0);
    expect(years(attrs)[0]?.years).toBe(quantize(DD_MM_TRUTH_MONTHS / 12));
  });

  it('reads the month from the non-day side regardless of which side it is on', () => {
    // DD/MM (Indian/European) and MM/DD (US) must both resolve to April 2019.
    const indian = extractYearsExperience('Engineer, Acme, 13/04/2019 - 13/04/2021', REF);
    const us = extractYearsExperience('Engineer, Acme, 04/13/2019 - 04/13/2021', REF);
    expect(years(indian)[0]?.years).toBe(2);
    expect(years(us)[0]?.years).toBe(2);
  });

  it('does not match when neither leading number can be a day', () => {
    // "13/25/2019" has no valid month on either side; it must not be trusted
    // as a date, and it is INVALID rather than AMBIGUOUS (E2) — 25 cannot be
    // a month under either locale reading, so there is no lower bound to
    // report either. Pins the `month >= 1 && month <= 12` check.
    const attrs = extractYearsExperience('Engineer, Acme, 13/25/2019 - 13/25/2021', REF);
    expect(attrs).toEqual([]);
  });

  it('does not disturb the MONTH_PATTERN dot form ("Jan. 2020") when adding the dot separator (E1)', () => {
    // The concern named in Task E1: THREE_PART_DATE_TOKEN's new `.` separator
    // must not shadow the existing "abbreviated month, dot, year" branch,
    // which starts with a LETTER and can never match the digit-only 3-part
    // pattern at the same text position.
    const attrs = extractYearsExperience('Engineer, Acme, Jan. 2020 - Mar. 2022', REF);
    expect(years(attrs)[0]?.years).toBe(quantize(((2022 - 2020) * 12 + (3 - 1)) / 12));
  });

  // ── E2/E3: the ambiguous shape (docs/NEXT_PHASE.md Task E) ─────────────
  // Renamed and flipped from three `DOCUMENTED GAP` tests (H-085's lesson:
  // pin what is WRONG so it cannot be silently reintroduced; once fixed,
  // flip and rename rather than delete, per ADR-028). An earlier version of
  // this block had only one gap test and described the defect as "a
  // two-sided ambiguous range is dropped"; an independent verifier
  // falsified that description on three counts (H-094) before the fix
  // below existed, which is why there are three renamed tests rather than
  // one.

  it('FIXED (E1-E3, H-089): an ambiguous date range is SURFACED, not silently deleted', () => {
    // H-094 correction 2: the END date governs just as much as the START —
    // an unambiguous start with an ambiguous end is unreadable too, so both
    // inputs below must produce a reservation-triggering attribute rather
    // than either a wrong number or an empty array.
    for (const text of [
      'Engineer, Acme, 03/04/2019 - 05/08/2022',
      'Engineer, Acme, 13/04/2013 - 05/08/2022',
    ]) {
      const attrs = extractYearsExperience(text, REF);
      // No silently wrong number: this range never becomes a
      // `years_experience` attribute.
      expect(years(attrs)).toEqual([]);
      // No silent deletion either: the role is on the record.
      const unreadable = attrs.find((a) => a.kind === 'unreadable_date_range');
      expect(unreadable).toBeDefined();
      expect(unreadable?.value).toBe(text.replace('Engineer, Acme, ', ''));
    }
  });

  it('FIXED (E1-E3, H-089): an open-ended ambiguous range keeps its FULL evidence span, and no longer guesses DD/MM', () => {
    // H-094's biggest correction: the range used to NOT abstain — it
    // silently committed to a locale via a truncated substring match. Now
    // the full span is kept and no number is asserted.
    const ddmmFirst = extractYearsExperience('Engineer, Acme, 03/04/2019 - Present', REF);
    expect(years(ddmmFirst)).toEqual([]);
    const ddmmUnreadable = ddmmFirst.find((a) => a.kind === 'unreadable_date_range');
    expect(ddmmUnreadable?.value).toBe('03/04/2019 - Present'); // NOT truncated to "04/2019 - Present"
    // The lower bound is computed (ADR-029), not merely "absent": true under
    // BOTH the DD/MM (April 2019) and MM/DD (March 2019) readings.
    expect(
      ddmmUnreadable?.kind === 'unreadable_date_range' && ddmmUnreadable.minPossibleYears,
    ).toBe(5.2);

    // The US-notation twin: "04/03/2013" used to be silently read as DD/MM
    // (4 March, right answer by accident) with a truncated span. Now it is
    // surfaced with its full span too, not resolved either way.
    const mmddFirst = extractYearsExperience('Engineer, Acme, 04/03/2013 - Present', REF);
    const mmddUnreadable = mmddFirst.find((a) => a.kind === 'unreadable_date_range');
    expect(mmddUnreadable?.value).toBe('04/03/2013 - Present'); // NOT truncated to "03/2013 - Present"
  });

  it('FIXED (E1, H-095): dash and dot separators no longer default to January and OVER-count', () => {
    // The opposite-direction defect (H-095): dash/dot forms used to miss the
    // slash-only 2-part fallback and default to January, inflating tenure.
    // E1 makes the dash/dot form reach the SAME 3-part classification as
    // slash, so an ambiguous dash/dot range is surfaced exactly like an
    // ambiguous slash range — never silently resolved to any month.
    for (const sep of ['-', '.']) {
      const text = `Engineer, Acme, 03${sep}04${sep}2013 - Present`;
      const attrs = extractYearsExperience(text, REF);
      expect(years(attrs)).toEqual([]);
      const unreadable = attrs.find((a) => a.kind === 'unreadable_date_range');
      expect(unreadable?.value).toBe(`03${sep}04${sep}2013 - Present`); // NOT truncated to "2013 - Present"
      // truth is 11.2 (April 2013 - Jun 2024): the computed lower bound
      // matches it exactly here, because the DD/MM reading IS the truth.
      expect(unreadable?.kind === 'unreadable_date_range' && unreadable.minPossibleYears).toBe(
        11.2,
      );
    }
  });
});

// ── H-104: per-range rounding inflates tenure ~20% ─────────────────────────
describe('H-104: per-range rounding no longer inflates a total built from many small ranges', () => {
  it('FIXED (H-104): 17 non-overlapping 3-month contracts sum to the true 4.25, not 5.1', () => {
    // Before the fix, each 3-month range (0.25y) was rounded to 1dp BEFORE
    // being summed: roundHalfUp(0.25, 1) = 0.3, and 17 * 0.3 = 5.1 -- a
    // systematic +20% that would read as ELIGIBLE against a 5-year
    // must-have when the truth (4.25) is not. 17 widely-separated,
    // non-overlapping ranges isolate the rounding bug from H-107's
    // (separate) interval-merge bug.
    const lines: string[] = [];
    for (let i = 0; i < 17; i++) {
      const y = 2000 + i;
      lines.push(`Contract Engineer, Client ${String(i)}, Jan ${String(y)} - Apr ${String(y)}`);
    }
    const attrs = extractYearsExperience(lines.join('\n'), REF_2026);
    const total = years(attrs).reduce((acc, a) => acc + a.years, 0);
    expect(quantize(total)).toBe(4.25);
  });

  it('FIXED (H-104): a single fractional range is no longer pre-rounded to 1dp before the total is computed', () => {
    // Jan 2019 - Mar 2022 = 38 months = 3.1666...7 years exactly. The old
    // per-range rounding stored 3.2 as the attribute's own `years`; the
    // fix carries the exact fraction and rounds only once, downstream, in
    // totalYearsExperience's `quantize(sum)`.
    const text = 'Engineer, Acme Corp, Jan 2019 - Mar 2022';
    const attrs = extractYearsExperience(text, REF);
    const dateAttr = years(attrs).find((a) => a.value.includes('Jan 2019'));
    const months = (2022 - 2019) * 12 + (3 - 1);
    expect(dateAttr?.years).toBeCloseTo(months / 12, 6);
  });
});

// ── H-101: one future-dated endpoint deletes the entire role ───────────────
describe('H-101: a future-dated END no longer deletes the whole role', () => {
  it('FIXED (H-101): "Jan 2015 - Dec 2026" (ref 2026-08) is CLAMPED to the reference date, not deleted', () => {
    const attrs = extractYearsExperience('Engineer, Acme, Jan 2015 - Dec 2026', REF_2026);
    const dateAttr = years(attrs).find((a) => a.value.includes('Jan 2015'));
    expect(dateAttr).toBeDefined();
    // Truth: Jan 2015 - Aug 2026 (clamped to the reference date), not
    // Jan 2015 - Dec 2026 (which would credit months that have not
    // happened yet) and not 0 (the old, silently-deleting behaviour).
    const truthMonths = (2026 - 2015) * 12 + (8 - 1);
    expect(dateAttr?.years).toBeCloseTo(truthMonths / 12, 6);
  });

  it('FIXED (H-101): an ordinary "... - Present" role is unaffected by the clamp change', () => {
    const attrs = extractYearsExperience('Engineer, Acme, Jan 2015 - Present', REF_2026);
    const dateAttr = years(attrs).find((a) => a.value.includes('Jan 2015'));
    const truthMonths = (2026 - 2015) * 12 + (8 - 1);
    expect(dateAttr?.years).toBeCloseTo(truthMonths / 12, 6);
  });

  it('the far-future guard still rejects a role that has not started yet (ref 2026-08)', () => {
    // Must keep working per the brief: clamping the END must not be
    // mistaken for an excuse to also clamp the START.
    expect(extractYearsExperience('Engineer, Acme Corp, Jan 2030 - Jan 2032', REF_2026)).toEqual(
      [],
    );
  });
});

// ── H-102: the D5c quantity guard deletes real roles ────────────────────────
describe('H-102: the D5c quantity guard no longer eats a metric bullet on the NEXT line', () => {
  it('FIXED (H-102): a metric bullet on the line AFTER a bare-year range no longer trips D5c', () => {
    const text = [
      'Software Engineer, Acme Corp',
      '2015 - 2026',
      'Scaled the platform to two million users.',
    ].join('\n');
    const attrs = extractYearsExperience(text, REF_2026);
    expect(attrs.some((a) => a.value.includes('2015'))).toBe(true);
  });

  it('FIXED (H-102): a metric bullet on the line BEFORE a bare-year range no longer trips D5c', () => {
    const text = [
      'Software Engineer, Acme Corp',
      'Scaled the platform to two million users.',
      '2015 - 2026',
    ].join('\n');
    const attrs = extractYearsExperience(text, REF_2026);
    expect(attrs.some((a) => a.value.includes('2015'))).toBe(true);
  });

  it('D5c still rejects a genuine quantity range on the SAME line (must not regress)', () => {
    const attrs = extractYearsExperience('Managed a budget of 2000 - 2024 USD.', REF);
    expect(attrs.some((a) => a.value.includes('2000'))).toBe(false);
  });

  it('D5c still rejects "Grew active users from 2015 - 2019" on the SAME line (must not regress)', () => {
    const attrs = extractYearsExperience('Grew active users from 2015 - 2019.', REF);
    expect(attrs.some((a) => a.value.includes('2015'))).toBe(false);
  });
});

// ── H-103: EXPLICIT_YEARS_PATTERN fabricates tenure from prose ─────────────
describe('H-103: EXPLICIT_YEARS_PATTERN requires genuine experience context', () => {
  it('FIXED (H-103): "N year old" is no longer read as a tenure claim', () => {
    const attrs = extractYearsExperience('Maintained a 15 year old legacy COBOL system.', REF);
    expect(years(attrs)).toEqual([]);
  });

  it.each(['partnership', 'contract', 'warranty', 'lease'])(
    'FIXED (H-103): "N year %s" is no longer read as a tenure claim',
    (noun) => {
      const attrs = extractYearsExperience(`Signed a 5 year ${noun} with the vendor.`, REF);
      expect(years(attrs)).toEqual([]);
    },
  );

  it('FIXED (H-103): a stated AGE is not tenure', () => {
    // "20 years old" is plural, so the singular/plural rule alone would let it
    // through. Excluded outright: ADR-007 keeps age proxies out of scoring.
    expect(years(extractYearsExperience('The candidate is 20 years old.', REF))).toEqual([]);
  });

  it.each([
    ['Over 20 years in backend engineering.', 20],
    ['15 years as a registered nurse.', 15],
    ['A qualified electrician with 18 years in the trade.', 18],
    ['Twelve months on site; 7 years in logistics before that.', 7],
  ])('a claim with NO "experience" keyword is still a claim: %s', (text, expected) => {
    // THE REGRESSION GUARD FOR THE FIRST ATTEMPT AT H-103, which required the
    // literal word "experience" to follow. That killed the fabrications and
    // ALSO killed these — ordinary CV phrasing. Measured before this line was
    // written: all four returned NONE.
    //
    // Why it matters more than it looks: an explicit claim is what
    // `totalYearsExperience` falls back to when no date range parses, so
    // dropping it does not produce "no opinion", it produces "found 0" about
    // someone with twenty years. That is the same silent-zero shape as H-101
    // and H-102, both closed in this same commit — a fix is not a fix if it
    // relocates the wrong number from too-high to zero.
    expect(years(extractYearsExperience(text, REF)).some((a) => a.years === expected)).toBe(true);
  });

  it('still parses "5+ years of experience" (must not regress)', () => {
    const text = 'I have 5+ years of experience in software engineering.';
    const attrs = extractYearsExperience(text, REF);
    expect(years(attrs)[0]?.years).toBe(5);
  });

  it('still parses "3 years experience with X" (must not regress)', () => {
    const attrs = extractYearsExperience('3 years experience with PostgreSQL.', REF);
    expect(years(attrs).some((a) => a.years === 3)).toBe(true);
  });

  it('still parses "N years of experience" restated as a bare "I have N years of experience." (must not regress)', () => {
    const attrs = extractYearsExperience('I have 6 years of experience.', REF);
    expect(years(attrs)[0]?.years).toBe(6);
  });

  it('FIXED (H-103), second face: a fabricated "N year old" claim no longer produces a fabricated blocking reservation trigger alongside a real range', () => {
    // Second face of H-103: with a real range also present, the old pattern
    // fabricated an `isExplicitStatement: true` attribute that
    // `discardedTenureClaim` (H-040/ADR-029) would compare against the
    // computed total, raising a reservation quoting a number ("15") the
    // document never asserted as tenure. With the context requirement,
    // no explicit-statement attribute is produced at all here.
    const text =
      'Maintained a 15 year old legacy COBOL system. Engineer, Acme, Jan 2019 - Jan 2022.';
    const attrs = extractYearsExperience(text, REF);
    expect(attrs.some((a) => a.kind === 'years_experience' && a.isExplicitStatement === true)).toBe(
      false,
    );
  });
});

// ── H-095: two-part numeric dates beyond slash-only ─────────────────────────
describe('H-095: two-part numeric dates extend beyond slash-only', () => {
  it('FIXED (H-095): parses MM.YYYY (dot separator)', () => {
    const attrs = extractYearsExperience('Engineer, Acme, 03.2019 - Present', REF_2026);
    const dateAttr = years(attrs).find((a) => a.value.includes('03.2019'));
    expect(dateAttr).toBeDefined();
    const months = (2026 - 2019) * 12 + (8 - 3);
    expect(dateAttr?.years).toBeCloseTo(months / 12, 6);
  });

  it('FIXED (H-095): parses MM-YYYY (dash separator)', () => {
    const attrs = extractYearsExperience('Engineer, Acme, 03-2019 - Present', REF_2026);
    const dateAttr = years(attrs).find((a) => a.value.includes('03-2019'));
    expect(dateAttr).toBeDefined();
    const months = (2026 - 2019) * 12 + (8 - 3);
    expect(dateAttr?.years).toBeCloseTo(months / 12, 6);
  });

  it('FIXED (H-095): parses YYYY/MM (year-first, slash)', () => {
    const attrs = extractYearsExperience('Engineer, Acme, 2015/03 - Present', REF_2026);
    const dateAttr = years(attrs).find((a) => a.value.includes('2015/03'));
    expect(dateAttr).toBeDefined();
    const months = (2026 - 2015) * 12 + (8 - 3);
    expect(dateAttr?.years).toBeCloseTo(months / 12, 6);
  });

  it('FIXED (H-095): parses YYYY-MM (year-first, dash)', () => {
    const attrs = extractYearsExperience('Engineer, Acme, 2015-03 - Present', REF_2026);
    const dateAttr = years(attrs).find((a) => a.value.includes('2015-03'));
    expect(dateAttr).toBeDefined();
    const months = (2026 - 2015) * 12 + (8 - 3);
    expect(dateAttr?.years).toBeCloseTo(months / 12, 6);
  });

  it('does not swallow a bare YYYY - YYYY range as a two-part date (must not regress)', () => {
    const text = 'Work History\nSoftware Engineer, Acme Corp\n2015 - 2019';
    const attrs = extractYearsExperience(text, REF);
    const dateAttr = years(attrs).find((a) => a.value.includes('2015'));
    expect(dateAttr?.years).toBe(4);
  });

  it('still rejects an out-of-range two-part month (13) regardless of separator or order (must not regress)', () => {
    expect(extractYearsExperience('Engineer 13.2019 - 12.2021', REF)).toEqual([]);
    expect(extractYearsExperience('Engineer 2019.13 - 2021.12', REF)).toEqual([]);
  });

  it('does not misread an ordinary decimal/version-like number as a two-part date (must not regress)', () => {
    expect(extractYearsExperience('Upgraded to PostgreSQL 12.4 in production.', REF)).toEqual([]);
  });
});

// ── H-107: concurrent ambiguous ranges double-count ─────────────────────────
describe('H-107: concurrent ambiguous ranges are merged, not independently summed', () => {
  it('FIXED (H-107): two identical, fully-overlapping ambiguous ranges report the merged bound once, not twice', () => {
    const text = [
      'Role A, Acme Corp, 03/06/2015 - 07/09/2020',
      'Role B, Beta Inc, 03/06/2015 - 07/09/2020',
    ].join('\n');
    const attrs = extractYearsExperience(text, REF_2026);
    const unreadable = attrs.filter(
      (a): a is Extract<typeof a, { kind: 'unreadable_date_range' }> =>
        a.kind === 'unreadable_date_range',
    );
    expect(unreadable).toHaveLength(2);
    const total = unreadable.reduce((acc, a) => acc + a.minPossibleYears, 0);
    // Day-first reading: Jun 2015 - Sep 2020 = 63 months = 5.25y.
    // Month-first reading: Mar 2015 - Jul 2020 = 64 months.
    // The two ranges are IDENTICAL and fully overlap under either single
    // consistent reading, so the sound merged lower bound is ONE
    // occurrence's duration (5.25), not two independently-computed
    // per-range minimums summed together (the old behaviour: 5.3 + 5.3 =
    // 10.6, since each range independently rounded its own min(63,64)=63
    // to 1dp before the caller summed them).
    expect(total).toBeCloseTo(5.25, 5);
  });

  it('a single ambiguous range is unaffected by the merge change (regression check on E2/E3)', () => {
    const attrs = extractYearsExperience('Engineer, Acme, 03/04/2019 - Present', REF);
    const unreadable = attrs.find((a) => a.kind === 'unreadable_date_range');
    expect(unreadable?.kind === 'unreadable_date_range' && unreadable.minPossibleYears).toBe(5.2);
  });
});
