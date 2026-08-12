import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { extractAttributes, extractEducation, extractSkills } from '../index.js';
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
});
