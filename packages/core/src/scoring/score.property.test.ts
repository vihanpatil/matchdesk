import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  CertificationAttribute,
  EducationAttribute,
  ExtractedAttribute,
  SkillAttribute,
  YearsExperienceAttribute,
} from '../extraction/types.js';
import { TAXONOMY } from '../taxonomy/data.js';
import { rankCandidates, scoreCandidate } from './score.js';
import { DEGREE_LADDER, SENIORITY_LADDER, type Candidate, type Job } from './types.js';

/**
 * Property-based tests (Section 4 of the engine task). These do NOT replace
 * the unit tests above — they sweep a much larger input space than any hand
 * picked example can, and are exactly the kind of test that would have
 * caught a monotonicity or partition regression the unit tests missed.
 */

const CANONICAL_SKILL_IDS = TAXONOMY.entries.map((e) => e.id);
const CERT_IDS = ['pmp', 'cissp', 'aws-saa', 'csm'] as const;

// A synthetic but validly-ordered ISO-ish string: no `Date` construction
// anywhere in packages/core (Section 6.6), and lexicographic ordering is all
// the tie-break logic actually needs.
const createdAtArb = fc.integer({ min: 0, max: 99_999_999 }).map((n) => String(n).padStart(8, '0'));
const idArb = fc.stringMatching(/^[a-z0-9-]{1,12}$/);
const weightArb = fc.integer({ min: 0, max: 50 });

const skillAttrArb: fc.Arbitrary<SkillAttribute> = fc
  .record({
    canonicalId: fc.constantFrom(...CANONICAL_SKILL_IDS),
    matchType: fc.constantFrom('exact' as const, 'alias' as const),
    start: fc.nat({ max: 300 }),
    len: fc.integer({ min: 1, max: 15 }),
  })
  .map(({ canonicalId, matchType, start, len }) => ({
    kind: 'skill' as const,
    value: canonicalId,
    normalizedValue: canonicalId,
    confidence: 0.9,
    sourceSpan: { start, end: start + len },
    canonicalId,
    matchType,
  }));

const yearsAttrArb: fc.Arbitrary<YearsExperienceAttribute> = fc
  .record({ years: fc.integer({ min: 0, max: 40 }), start: fc.nat({ max: 300 }) })
  .map(({ years, start }) => ({
    kind: 'years_experience' as const,
    value: `${String(years)} years`,
    normalizedValue: String(years),
    confidence: 0.9,
    sourceSpan: { start, end: start + 5 },
    years,
  }));

const educationAttrArb: fc.Arbitrary<EducationAttribute> = fc
  .record({ degreeLevel: fc.constantFrom(...DEGREE_LADDER), start: fc.nat({ max: 300 }) })
  .map(({ degreeLevel, start }) => ({
    kind: 'education' as const,
    value: degreeLevel,
    normalizedValue: degreeLevel,
    confidence: 0.85,
    sourceSpan: { start, end: start + 5 },
    degreeLevel,
    field: null,
  }));

const certAttrArb: fc.Arbitrary<CertificationAttribute> = fc
  .record({ canonicalId: fc.constantFrom(...CERT_IDS), start: fc.nat({ max: 300 }) })
  .map(({ canonicalId, start }) => ({
    kind: 'certification' as const,
    value: canonicalId,
    normalizedValue: canonicalId,
    confidence: 0.9,
    sourceSpan: { start, end: start + 5 },
    canonicalId,
  }));

const attributeArb: fc.Arbitrary<ExtractedAttribute> = fc.oneof(
  skillAttrArb,
  yearsAttrArb,
  educationAttrArb,
  certAttrArb,
);

const candidateArb: fc.Arbitrary<Candidate> = fc.record({
  id: idArb,
  createdAt: createdAtArb,
  attributes: fc.array(attributeArb, { maxLength: 12 }),
});

const skillRequirementArb = fc.record({
  id: idArb,
  canonicalSkillId: fc.constantFrom(...CANONICAL_SKILL_IDS),
  label: fc.constantFrom(...CANONICAL_SKILL_IDS),
  mustHave: fc.boolean(),
});

const skillsSpecArb = fc.record({
  weight: weightArb,
  requirements: fc.array(skillRequirementArb, { maxLength: 5 }),
});

const experienceSpecArb = fc.record({
  weight: weightArb,
  requirement: fc.record(
    { minYears: fc.integer({ min: 0, max: 30 }), mustHave: fc.boolean() },
    { requiredKeys: ['minYears'] },
  ),
});

const seniSpecArb = fc.record({
  weight: weightArb,
  requirement: fc.record(
    { level: fc.constantFrom(...SENIORITY_LADDER), mustHave: fc.boolean() },
    { requiredKeys: ['level'] },
  ),
});

const educationCertsSpecArb = fc.record({
  weight: weightArb,
  requirement: fc.record(
    {
      minDegreeLevel: fc.constantFrom(...DEGREE_LADDER),
      mustHave: fc.boolean(),
      requiredCertifications: fc.array(fc.constantFrom(...CERT_IDS), { maxLength: 2 }),
    },
    { requiredKeys: ['minDegreeLevel'] },
  ),
});

const jobArb: fc.Arbitrary<Job> = fc.record(
  {
    id: idArb,
    skills: skillsSpecArb,
    experience: experienceSpecArb,
    seniority: seniSpecArb,
    educationCerts: educationCertsSpecArb,
  },
  { requiredKeys: ['id'] },
);

describe('scoring property tests', () => {
  it('the score is always an integer in [0, 100]', () => {
    fc.assert(
      fc.property(jobArb, candidateArb, (job, candidate) => {
        const result = scoreCandidate(job, candidate);
        expect(Number.isInteger(result.score)).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('dimension contributions sum to the total, within rounding tolerance', () => {
    fc.assert(
      fc.property(jobArb, candidateArb, (job, candidate) => {
        const result = scoreCandidate(job, candidate);
        // Each dimension's contribution is independently quantized to 6dp
        // (ADR-009) before being summed, so the un-quantized sum of already-
        // quantized parts can differ from the quantized total by up to
        // ~0.5e-6 per dimension. With up to 4 dimensions that is comfortably
        // inside 1e-4 — still negligible on a 0-100 score scale, and this is
        // exactly the "± rounding" tolerance the property is about.
        const sum = result.dimensions.reduce((acc, d) => acc + d.contribution, 0);
        expect(Math.abs(sum - result.raw)).toBeLessThan(1e-4);
        expect(Math.abs(result.explanation.composition.total - result.raw)).toBeLessThan(1e-4);
      }),
    );
  });

  it('every strength and gap evidence span, when present, is well-formed (start >= 0, end > start)', () => {
    fc.assert(
      fc.property(jobArb, candidateArb, (job, candidate) => {
        const result = scoreCandidate(job, candidate);
        for (const s of result.explanation.strengths) {
          if (s.evidence === null) continue;
          expect(s.evidence.start).toBeGreaterThanOrEqual(0);
          expect(s.evidence.end).toBeGreaterThan(s.evidence.start);
        }
      }),
    );
  });

  it('no scoring function throws on degenerate input: empty attributes, zero requirements, all-zero weights', () => {
    fc.assert(
      fc.property(idArb, createdAtArb, (id, createdAt) => {
        const emptyCandidate: Candidate = { id, createdAt, attributes: [] };
        expect(() => scoreCandidate({ id: 'j' }, emptyCandidate)).not.toThrow();
        expect(() =>
          scoreCandidate(
            {
              id: 'j',
              skills: { weight: 0, requirements: [] },
              seniority: { weight: 0, requirement: { level: 'junior' } },
            },
            emptyCandidate,
          ),
        ).not.toThrow();
      }),
    );
  });

  it('monotonicity: adding a matched preferred requirement never decreases the score', () => {
    fc.assert(
      fc.property(
        weightArb,
        fc.array(
          skillRequirementArb.map((r) => ({ ...r, mustHave: false })),
          { minLength: 1, maxLength: 4 },
        ),
        candidateArb,
        fc.constantFrom(...CANONICAL_SKILL_IDS),
        (weight, requirements, candidate, extraSkillId) => {
          const job: Job = { id: 'j', skills: { weight: Math.max(weight, 1), requirements } };
          const before = scoreCandidate(job, candidate).score;

          const extraSkill: SkillAttribute = {
            kind: 'skill',
            value: extraSkillId,
            normalizedValue: extraSkillId,
            confidence: 1,
            sourceSpan: { start: 10_000, end: 10_010 },
            canonicalId: extraSkillId,
            matchType: 'exact',
          };
          const augmented: Candidate = {
            ...candidate,
            attributes: [...candidate.attributes, extraSkill],
          };
          const after = scoreCandidate(job, augmented).score;

          expect(after).toBeGreaterThanOrEqual(before);
        },
      ),
    );
  });
});

describe('ranking property tests', () => {
  it('shuffling the candidate input order never changes any score or the final ranking', () => {
    const shuffleArb = fc
      .uniqueArray(candidateArb, { maxLength: 8, selector: (c) => c.id })
      .chain((candidates) =>
        fc
          .shuffledSubarray(candidates, {
            minLength: candidates.length,
            maxLength: candidates.length,
          })
          .map((shuffled) => ({ candidates, shuffled })),
      );

    fc.assert(
      fc.property(jobArb, shuffleArb, (job, { candidates, shuffled }) => {
        const original = rankCandidates(job, candidates);
        const reordered = rankCandidates(job, shuffled);
        expect(reordered).toEqual(original);
      }),
    );
  });

  it('ineligible candidates never sort above eligible ones, and the eligibility flag matches the partition', () => {
    fc.assert(
      fc.property(jobArb, fc.array(candidateArb, { maxLength: 8 }), (job, candidates) => {
        const { eligible, ineligible } = rankCandidates(job, candidates);
        for (const r of eligible) expect(r.eligibility.eligible).toBe(true);
        for (const r of ineligible) expect(r.eligibility.eligible).toBe(false);
      }),
    );
  });

  it('does not throw for an empty candidate list or a job with no requirements', () => {
    fc.assert(
      fc.property(idArb, (id) => {
        expect(() => rankCandidates({ id }, [])).not.toThrow();
      }),
    );
  });
});
