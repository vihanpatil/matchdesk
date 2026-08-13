import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { extractAttributes, extractEducation, extractSkills } from '../index.js';
import { totalYearsExperience } from '../scoring/dimensions.js';
import { TAXONOMY } from '../taxonomy/data.js';
import {
  cvSpecArbitrary,
  EXPERIENCE_HEADERS,
  JOB_TITLES,
  NAMES,
  renderCv,
  SKILLS_HEADERS,
  summarize,
  summarizeSkills,
} from '../testkit/cv.js';

/**
 * METAMORPHIC RELATIONS over CV text.
 *
 * A metamorphic relation compares two runs of the system and asserts how they
 * must relate — without anyone having to know the correct answer for either.
 * `score(cv)` must equal `score(cv with the header renamed)`, and no expected
 * value was ever authored.
 *
 * This is the primary defence against the failure that has now recurred five
 * times (H-030): a green suite over an unrepresentative input space. Unit tests
 * and coverage measure whether the code the author imagined behaves as the
 * author imagined. These measure whether the system is self-consistent across
 * inputs nobody imagined.
 *
 * EVERY relation below corresponds to a defect that reached a green suite.
 * When one fails, read the linked HONESTY_LOG entry before changing it — and
 * never weaken a relation to make it pass. See ADR-019.
 */

const REF = { referenceDate: { year: 2026, month: 1 } } as const;
const RUNS = { numRuns: 300 } as const;

/** Canonical skill labels the extractor should be able to find. */
const ENTRIES = TAXONOMY.entries;
const SKILL_POOL: readonly string[] = ENTRIES.map((e) => e.label);

describe('metamorphic: invariance — things that must NOT change the result', () => {
  it('R1 · renaming an experience-section header does not change what is extracted (H-028 D1)', () => {
    fc.assert(
      fc.property(
        cvSpecArbitrary(SKILL_POOL),
        fc.constantFrom(...EXPERIENCE_HEADERS),
        fc.constantFrom(...EXPERIENCE_HEADERS),
        (spec, headerA, headerB) => {
          const a = extractAttributes(renderCv({ ...spec, experienceHeader: headerA }), REF);
          const b = extractAttributes(renderCv({ ...spec, experienceHeader: headerB }), REF);
          expect(summarize(b)).toEqual(summarize(a));
        },
      ),
      RUNS,
    );
  });

  it('R2 · renaming a skills-section header does not change what is extracted (H-028 D1)', () => {
    fc.assert(
      fc.property(
        cvSpecArbitrary(SKILL_POOL),
        fc.constantFrom(...SKILLS_HEADERS),
        fc.constantFrom(...SKILLS_HEADERS),
        (spec, headerA, headerB) => {
          const a = extractAttributes(renderCv({ ...spec, skillsHeader: headerA }), REF);
          const b = extractAttributes(renderCv({ ...spec, skillsHeader: headerB }), REF);
          expect(summarize(b)).toEqual(summarize(a));
        },
      ),
      RUNS,
    );
  });

  it("R3 · a candidate's NAME never affects their SKILLS (H-028 D3)", () => {
    // The defect this pins: "Rémi Dubois" produced an exact match for the skill
    // `r`, ranked the candidate eligible for an R role, and showed the letter R
    // sliced out of their own name as the evidence. It fired on accents, so it
    // correlated with non-English names.
    fc.assert(
      fc.property(
        cvSpecArbitrary(SKILL_POOL),
        fc.constantFrom(...NAMES),
        fc.constantFrom(...NAMES),
        (spec, nameA, nameB) => {
          const a = extractSkills(renderCv({ ...spec, name: nameA }));
          const b = extractSkills(renderCv({ ...spec, name: nameB }));
          expect(summarizeSkills(b)).toEqual(summarizeSkills(a));
        },
      ),
      RUNS,
    );
  });

  it('R4 · line endings do not change what is extracted', () => {
    fc.assert(
      fc.property(cvSpecArbitrary(SKILL_POOL), (spec) => {
        const lf = extractAttributes(renderCv({ ...spec, lineEnding: '\n' }), REF);
        const crlf = extractAttributes(renderCv({ ...spec, lineEnding: '\r\n' }), REF);
        expect(summarize(crlf)).toEqual(summarize(lf));
      }),
      RUNS,
    );
  });

  it('R5 · section ORDER does not change what is extracted (H-028 D1)', () => {
    fc.assert(
      fc.property(cvSpecArbitrary(SKILL_POOL), (spec) => {
        const eduLast = extractAttributes(renderCv({ ...spec, educationFirst: false }), REF);
        const eduFirst = extractAttributes(renderCv({ ...spec, educationFirst: true }), REF);
        expect(summarize(eduFirst)).toEqual(summarize(eduLast));
      }),
      RUNS,
    );
  });
});

describe('metamorphic: completeness — things that must be found', () => {
  it('R6 · adding text never removes a skill that was already found (H-028 D2)', () => {
    // WHY THIS SHAPE. The first formulation asserted that a whitespace-delimited
    // term inside a longer term must still be extracted — "Ruby on Rails" must
    // yield `ruby`. It then demanded `c` out of "C Sharp", which is false: C#
    // is a different language from C. "Rails implies Ruby" is a SEMANTIC
    // judgement and "C Sharp implies C" is not, and no lexical rule separates
    // them. A relation that needs a human to adjudicate each pair is not a
    // relation.
    //
    // Non-destruction needs no such judgement and catches the underlying
    // mechanism — longest-first matching consuming a shorter term — wherever
    // both terms genuinely appear. Whether a lone "Ruby on Rails" should
    // satisfy a Ruby must-have is a product decision about taxonomy `related`
    // edges and the cascade, tracked separately, not something to smuggle in
    // as a test.
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...SKILL_POOL), { minLength: 1, maxLength: 4 }),
        fc.uniqueArray(fc.constantFrom(...SKILL_POOL), { minLength: 1, maxLength: 4 }),
        (groupA, groupB) => {
          const textA = `Skills: ${groupA.join(', ')}`;
          const textB = `Skills: ${groupB.join(', ')}`;
          const combined = `${textA}\n${textB}`;

          const found = new Set(extractSkills(combined).map((s) => s.normalizedValue));
          for (const s of [...extractSkills(textA), ...extractSkills(textB)]) {
            expect(
              found,
              `"${s.normalizedValue}" was found alone but disappeared once more text was added`,
            ).toContain(s.normalizedValue);
          }
        },
      ),
      RUNS,
    );
  });

  it('R6b · a skill is found regardless of the surrounding list position', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...SKILL_POOL), { minLength: 2, maxLength: 5 }),
        (skills) => {
          const forward = new Set(
            extractSkills(`Skills: ${skills.join(', ')}`).map((s) => s.normalizedValue),
          );
          const reversed = new Set(
            extractSkills(`Skills: ${[...skills].reverse().join(', ')}`).map(
              (s) => s.normalizedValue,
            ),
          );
          const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
          expect([...reversed].sort(cmp)).toEqual([...forward].sort(cmp));
        },
      ),
      RUNS,
    );
  });

  it('R6c · longest-first matching must not consume a genuinely-implied shorter skill (H-028 D2)', () => {
    // A CURATED list, deliberately. Each pair is a human judgement that the
    // longer term genuinely implies the shorter one, and the list is short
    // enough to be reviewed. `c sharp` -> `c` is NOT here, because C# is a
    // different language from C — which is exactly why this cannot be derived
    // mechanically from the taxonomy.
    const IMPLIES: readonly (readonly [string, string])[] = [
      ['Ruby on Rails', 'ruby'],
      ['SQL Server', 'sql'],
      ['Spring Boot', 'spring'],
      ['GitHub Actions', 'github'],
    ];

    for (const [text, mustContain] of IMPLIES) {
      const found = extractSkills(`Skills: ${text}`).map((s) => s.normalizedValue);
      expect(
        found,
        `"${text}" genuinely implies "${mustContain}", but extraction lost it`,
      ).toContain(mustContain);
    }
  });
});

describe('metamorphic: non-fabrication — things that must NOT be invented', () => {
  it('R7 · a job title never produces a degree (H-028 D4)', () => {
    // "Associate Software Engineer" produced a phantom associate degree worth
    // +50 points and flipped a hard eligibility gate, with the evidence
    // highlight pointing at a word inside a job title.
    for (const title of JOB_TITLES) {
      const degrees = extractEducation(`${title}, Acme Corporation`);
      expect(
        degrees.map((d) => d.normalizedValue),
        `job title "${title}" must not yield a degree`,
      ).toEqual([]);
    }
  });

  it('R8 · certification level names never produce a degree (H-028 D4)', () => {
    for (const cert of [
      'AWS Certified Solutions Architect - Associate',
      'AWS Certified Solutions Architect - Professional',
      'Microsoft Certified: Azure Administrator Associate',
    ]) {
      expect(
        extractEducation(cert).map((d) => d.normalizedValue),
        `certification "${cert}" must not yield a degree`,
      ).toEqual([]);
    }
  });

  it('R9 · ordinary English prose never produces a degree (H-028 D4)', () => {
    for (const prose of [
      'Tutored students in subjects such as Mathematics and Physics.',
      'Worked with tools such as Docker in production.',
      'Reported to the board as the technical lead.',
    ]) {
      expect(
        extractEducation(prose).map((d) => d.normalizedValue),
        `prose "${prose}" must not yield a degree`,
      ).toEqual([]);
    }
  });

  it('R10 · a field of study with no degree word never produces a degree, at ANY context length (H-033)', () => {
    // WHY THIS IS A GENERATED PROPERTY AND NOT A LOOP. The first version of
    // this test was a nested `for` over two hard-coded lists. An E2 audit
    // (H-051) correctly called that out: it lived in the metamorphic file and
    // was named like a relation, but it asserted only the 60 combinations
    // someone thought of — which is precisely the failure mode R9 already
    // demonstrated, where a hand-written sentence passed by luck because a
    // trailing " and Physics" happened to defeat the field lookup.
    //
    // H-033 is ABOUT context length: the degree guard looks back over an
    // 80-character window, so the same fragment yields a degree or not
    // depending on how much text precedes it. A test that cannot vary the
    // context length cannot test the defect. `padding` below sweeps across
    // and past that window.
    const FIELDS = [
      'Mathematics',
      'Computer Science',
      'Physics',
      'Economics',
      'Psychology',
      'Biology',
      'Chemistry',
      'Finance',
      'Marketing',
      'Data Science',
    ];
    const LEAD_INS = [
      'such as',
      'subjects such as',
      'in subjects such as',
      'interested in',
      'courses in',
      'tutoring in',
      'reading about',
    ];
    const TAILS = ['', '.', ',', ' and related areas.', '\n', ' with the team.'];
    // Deliberately contains no degree keyword and no ambiguous two-letter
    // token, so any degree extracted from a padded string is a fabrication.
    const FILLER_WORD = 'project ';

    fc.assert(
      fc.property(
        fc.constantFrom(...FIELDS),
        fc.constantFrom(...LEAD_INS),
        fc.constantFrom(...TAILS),
        fc.nat({ max: 30 }),
        (field, leadIn, tail, paddingWords) => {
          const filler = FILLER_WORD.repeat(paddingWords);
          const text = `${filler}${leadIn} ${field}${tail}`;

          expect(
            extractEducation(text).map((d) => d.normalizedValue),
            `"${text}" states no qualification, so it must not yield a degree`,
          ).toEqual([]);
        },
      ),
      RUNS,
    );
  });
});

/**
 * Characters that render as nothing but are real code points in extracted
 * text. Word, InDesign and most PDF producers emit them routinely — soft
 * hyphens at justified line breaks, zero-width spaces inside ligatures, a BOM
 * at the head of the stream. A recruiter cannot see them and would have no
 * idea why a CV scored differently (H-034).
 */
const INVISIBLE_CHARS: readonly string[] = [
  '\u200B', // zero-width space
  '\u00AD', // soft hyphen
  '\u200C', // zero-width non-joiner
  '\u200D', // zero-width joiner
  '\u2060', // word joiner
  '\uFEFF', // zero-width no-break space / BOM
];

describe('metamorphic: invisible characters must not change the result (H-034)', () => {
  it('R11 · inserting one invisible character anywhere does not change what is extracted', () => {
    fc.assert(
      fc.property(
        cvSpecArbitrary(SKILL_POOL),
        fc.constantFrom(...INVISIBLE_CHARS),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (spec, invisible, position) => {
          const clean = renderCv(spec);
          const at = Math.floor(position * clean.length);
          const polluted = `${clean.slice(0, at)}${invisible}${clean.slice(at)}`;

          expect(
            summarize(extractAttributes(polluted, REF)),
            `inserting ${JSON.stringify(invisible)} at offset ${String(at)} changed extraction`,
          ).toEqual(summarize(extractAttributes(clean, REF)));
        },
      ),
      RUNS,
    );
  });

  it('R12 · invisible characters between every character do not change which skills are found', () => {
    // The pathological version of R11: a PDF that emits a soft hyphen at
    // every ligature boundary. If extraction is invisible-blind this is
    // identical to the clean text; if it is not, every term is destroyed.
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...SKILL_POOL), { minLength: 1, maxLength: 4 }),
        fc.constantFrom(...INVISIBLE_CHARS),
        (skills, invisible) => {
          const clean = `Skills: ${skills.join(', ')}`;
          const polluted = Array.from(clean).join(invisible);

          expect(summarizeSkills(extractSkills(polluted))).toEqual(
            summarizeSkills(extractSkills(clean)),
          );
        },
      ),
      RUNS,
    );
  });
});

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

interface GeneratedRange {
  readonly startYear: number;
  readonly startMonth: number;
  readonly months: number;
}

/** Ranges that always end on or before the reference date, so a range is
 *  never discarded as future-dated and the relation stays about merging. */
const rangeArbitrary = fc
  .record({
    startYear: fc.integer({ min: 1996, max: 2020 }),
    startMonth: fc.integer({ min: 1, max: 12 }),
    months: fc.integer({ min: 1, max: 60 }),
  })
  .map((r): GeneratedRange => r);

function absoluteMonth(year: number, month: number): number {
  return year * 12 + month;
}

function renderRange(range: GeneratedRange): string {
  const startAbs = absoluteMonth(range.startYear, range.startMonth);
  const endAbs = startAbs + range.months;
  const endYear = Math.floor((endAbs - 1) / 12);
  const endMonth = ((endAbs - 1) % 12) + 1;
  const start = `${MONTHS[range.startMonth - 1] ?? 'Jan'} ${String(range.startYear)}`;
  const end = `${MONTHS[endMonth - 1] ?? 'Jan'} ${String(endYear)}`;
  return `Software Engineer, Acme Corporation\n${start} - ${end}`;
}

function calendarSpanYears(ranges: readonly GeneratedRange[]): number {
  const starts = ranges.map((r) => absoluteMonth(r.startYear, r.startMonth));
  const ends = ranges.map((r) => absoluteMonth(r.startYear, r.startMonth) + r.months);
  return (Math.max(...ends) - Math.min(...starts)) / 12;
}

describe('metamorphic: years of experience cannot exceed elapsed time (H-028 D5)', () => {
  it('R13 · total experience never exceeds the calendar span from earliest start to latest end', () => {
    // The relation that would have caught D5b directly, with no expected
    // value authored: a person cannot accumulate more years of experience
    // than have elapsed between their first job starting and their last one
    // ending, no matter how many concurrent roles they list.
    fc.assert(
      fc.property(fc.array(rangeArbitrary, { minLength: 1, maxLength: 4 }), (ranges) => {
        const text = ['Work History', ...ranges.map(renderRange)].join('\n');
        const total = totalYearsExperience(extractAttributes(text, REF));

        // Each emitted piece is rounded to 1dp independently, so the sum can
        // exceed the true union by up to 0.05 per piece. The tolerance covers
        // rounding only — it is far below the ~2x error D5b produced.
        const tolerance = 0.05 * ranges.length;
        expect(total).toBeLessThanOrEqual(calendarSpanYears(ranges) + tolerance);
      }),
      RUNS,
    );
  });

  it('R14 · listing a role twice does not increase total experience', () => {
    fc.assert(
      fc.property(rangeArbitrary, (range) => {
        const once = ['Work History', renderRange(range)].join('\n');
        const twice = ['Work History', renderRange(range), renderRange(range)].join('\n');

        expect(totalYearsExperience(extractAttributes(twice, REF))).toBeCloseTo(
          totalYearsExperience(extractAttributes(once, REF)),
          5,
        );
      }),
      RUNS,
    );
  });

  it('R15 · the ORDER roles are listed in does not change total experience', () => {
    fc.assert(
      fc.property(fc.array(rangeArbitrary, { minLength: 2, maxLength: 4 }), (ranges) => {
        const forward = ['Work History', ...ranges.map(renderRange)].join('\n');
        const reversed = ['Work History', ...[...ranges].reverse().map(renderRange)].join('\n');

        expect(totalYearsExperience(extractAttributes(reversed, REF))).toBeCloseTo(
          totalYearsExperience(extractAttributes(forward, REF)),
          5,
        );
      }),
      RUNS,
    );
  });

  it('R16 · a quantity that looks like a year range never adds experience (H-028 D5c)', () => {
    // "Managed a budget of 2000 - 2024 USD" parsed as 24 years of employment.
    // Stated as a relation: appending a sentence about a QUANTITY must never
    // increase the total, whatever the numbers in it happen to be.
    const QUANTITY_FRAMES: readonly ((a: number, b: number) => string)[] = [
      (a, b) => `Managed a budget of ${String(a)} - ${String(b)} USD.`,
      (a, b) => `Grew active users from ${String(a)} - ${String(b)}.`,
      (a, b) => `Handled ${String(a)} - ${String(b)} transactions per day.`,
      (a, b) => `Supported ${String(a)} - ${String(b)} customers across the region.`,
    ];

    fc.assert(
      fc.property(
        rangeArbitrary,
        fc.integer({ min: 1000, max: 2000 }),
        fc.integer({ min: 2001, max: 2024 }),
        fc.nat({ max: QUANTITY_FRAMES.length - 1 }),
        (range, low, high, frameIndex) => {
          const frame = QUANTITY_FRAMES[frameIndex] ?? QUANTITY_FRAMES[0];
          if (frame === undefined) return;

          const base = ['Work History', renderRange(range)].join('\n');
          const withQuantity = [base, frame(low, high)].join('\n');

          expect(totalYearsExperience(extractAttributes(withQuantity, REF))).toBeCloseTo(
            totalYearsExperience(extractAttributes(base, REF)),
            5,
          );
        },
      ),
      RUNS,
    );
  });
});
