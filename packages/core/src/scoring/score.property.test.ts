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
import { hasCertification, inferSeniorityLevel } from './dimensions.js';
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

/**
 * `label` is DERIVED from `canonicalSkillId` rather than generated
 * independently, because in production a requirement's label comes from the
 * skill it refers to. Generating them independently produced jobs where a
 * requirement for `vue` was labelled `javascript`, and the resulting failures
 * were artefacts of an impossible input rather than defects — a generator
 * that can produce states the system can never reach wastes the signal it
 * exists to give.
 */
const skillRequirementArb = fc
  .record({
    id: idArb,
    canonicalSkillId: fc.constantFrom(...CANONICAL_SKILL_IDS),
    mustHave: fc.boolean(),
  })
  .map((r) => ({ ...r, label: r.canonicalSkillId }));

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

/**
 * Jobs that state at least one requirement.
 *
 * The filter is load-bearing, not cosmetic. With all four dimensions optional
 * this arbitrary could generate a job that activates NO dimension, which is
 * now rejected input (H-066) — so without the filter these properties fail
 * only on the runs where fast-check happens to produce the empty shape, which
 * is H-058's non-determinism turned into an intermittently red suite. A
 * dimensionless job gets its own explicit test instead of arriving here by
 * chance.
 */
const jobArb: fc.Arbitrary<Job> = fc
  .record(
    {
      id: idArb,
      skills: skillsSpecArb,
      experience: experienceSpecArb,
      seniority: seniSpecArb,
      educationCerts: educationCertsSpecArb,
    },
    { requiredKeys: ['id'] },
  )
  .filter(
    (job) =>
      job.skills !== undefined ||
      job.experience !== undefined ||
      job.seniority !== undefined ||
      job.educationCerts !== undefined,
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

        // NARROWED, with the reason stated (SESSION_STATE's fixture rule forbids doing
        // this silently). This property previously asserted that a job with
        // NO dimensions also does not throw. It now must throw: it returned
        // score 0 with eligible:true for every candidate, and zero is a claim
        // about a person that a recruiter cannot distinguish from a genuine
        // no-match (H-028 D8, closed by H-066).
        //
        // The property's real subject — that degenerate but ANSWERABLE input
        // is handled totally rather than by crashing — is unchanged and is
        // still asserted below. This is the same narrowing H-050 made for
        // negative weights.
        expect(() => scoreCandidate({ id: 'j' }, emptyCandidate)).toThrow(
          /activates no scoring dimension/,
        );
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

/**
 * PROPERTIES ADDED FOR ADR-023 E2 (H-051).
 *
 * H-029 recorded that the seniority ladder thresholds and `hasCertification`'s
 * `kind` check are movable with a green suite — a mutant that drops the kind
 * check means a SKILL named `pmp` satisfies a required CERTIFICATION. H-036
 * recorded that `explain.ts`, which builds the text a recruiter reads to
 * justify a decision, has 140 surviving mutants and no test of its content.
 * Both were pinned by nothing generated.
 */
describe('seniority and certification properties (H-029)', () => {
  it('seniority is monotone in years: more experience never infers a LOWER level', () => {
    // Pins every threshold boundary without hard-coding one. A mutant that
    // flips a >= to > or moves a threshold breaks monotonicity somewhere in
    // the generated range, which no fixed example set guarantees to hit.
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 60, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        (a, b) => {
          const lower = Math.min(a, b);
          const higher = Math.max(a, b);
          const lowerIndex = SENIORITY_LADDER.indexOf(inferSeniorityLevel(lower));
          const higherIndex = SENIORITY_LADDER.indexOf(inferSeniorityLevel(higher));

          expect(higherIndex).toBeGreaterThanOrEqual(lowerIndex);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('a SKILL never satisfies a certification requirement, whatever it is named (H-029)', () => {
    // The exact surviving mutant: dropping `a.kind === 'certification'` from
    // hasCertification. A candidate listing the skill "pmp" would then satisfy
    // a required PMP certification — credentials fabricated from a skills
    // list. Generated over every certification id AND every taxonomy skill id
    // so the collision is found wherever the two vocabularies overlap.
    fc.assert(
      fc.property(fc.constantFrom(...CERT_IDS, ...CANONICAL_SKILL_IDS), (id) => {
        const skillOnly: readonly ExtractedAttribute[] = [
          {
            kind: 'skill',
            value: id,
            normalizedValue: id,
            confidence: 0.95,
            sourceSpan: { start: 0, end: Math.max(1, id.length) },
            canonicalId: id,
            matchType: 'exact',
          },
        ];

        expect(
          hasCertification(id, skillOnly),
          `a skill named "${id}" must not satisfy a certification requirement`,
        ).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  it('a certification satisfies ONLY its own canonical id (H-028 D8: level-variant identity)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CERT_IDS), fc.constantFrom(...CERT_IDS), (held, required) => {
        const attrs: readonly ExtractedAttribute[] = [
          {
            kind: 'certification',
            value: held,
            normalizedValue: held,
            confidence: 0.9,
            sourceSpan: { start: 0, end: Math.max(1, held.length) },
            canonicalId: held,
          },
        ];

        expect(hasCertification(required, attrs)).toBe(held === required);
      }),
      { numRuns: 200 },
    );
  });
});

describe('weight validation properties (H-028 D8 / H-050)', () => {
  it('ANY negative weight is rejected, on every dimension', () => {
    // Pinned by example tests only until now. A negative weight inverts a
    // dimension — the candidate is rewarded for NOT matching — and produced a
    // score of 100/100 before H-050. Generated over every dimension and a
    // range of negative magnitudes so no single hand-picked case is load
    // bearing.
    fc.assert(
      fc.property(
        fc.constantFrom('skills', 'experience', 'seniority', 'educationCerts'),
        fc.double({ min: -1000, max: -0.000001, noNaN: true }),
        candidateArb,
        (dimension, weight, candidate) => {
          // Built as a typed Job per dimension rather than assembled through
          // an index signature and cast — the repo bans `as` narrowing, and a
          // cast here would also let a malformed job through the very check
          // being tested.
          const job: Job =
            dimension === 'skills'
              ? { id: 'j', skills: { weight, requirements: [] } }
              : dimension === 'experience'
                ? { id: 'j', experience: { weight, requirement: { minYears: 3 } } }
                : dimension === 'seniority'
                  ? { id: 'j', seniority: { weight, requirement: { level: 'senior' } } }
                  : {
                      id: 'j',
                      educationCerts: { weight, requirement: { minDegreeLevel: 'bachelor' } },
                    };

          expect(() => scoreCandidate(job, candidate)).toThrow(/negative/i);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('explanation anti-fabrication properties (H-036)', () => {
  it('never reports a strength for a requirement the job did not state', () => {
    // explain.ts builds what the recruiter reads to justify a shortlisting
    // decision to a hiring manager or a candidate. 140 of its mutants survive,
    // so its CONTENT is essentially unverified. This is the property that
    // matters most: it must not invent a reason.
    fc.assert(
      fc.property(jobArb, candidateArb, (job, candidate) => {
        const result = scoreCandidate(job, candidate);
        const statedSkillLabels = new Set(
          (job.skills?.requirements ?? []).map((r) => r.label.toLowerCase()),
        );

        for (const strength of result.explanation.strengths) {
          if (strength.dimension !== 'skills') continue;
          expect(
            statedSkillLabels.has(strength.label.toLowerCase()),
            `strength "${strength.label}" was not a stated requirement of job ${job.id}`,
          ).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  /**
   * H-028 D8, closed by H-066. Measured before the fix: reversing a
   * candidate's attribute array moved the reported tenure evidence from
   * "10 years of experience" to "Jan 2016 - Jan 2026" while the score stayed
   * at 100. Which genuine piece of evidence a recruiter sees must not depend
   * on an array order nobody ever contracted.
   */
  it('the explanation does not depend on the ORDER of a candidate’s attributes', () => {
    fc.assert(
      fc.property(jobArb, candidateArb, (job, candidate) => {
        const forward = scoreCandidate(job, candidate);
        const reversed = scoreCandidate(job, {
          ...candidate,
          attributes: [...candidate.attributes].reverse(),
        });

        expect(reversed.score).toBe(forward.score);
        expect(reversed.explanation).toEqual(forward.explanation);
      }),
    );
  });

  it('never reports a gap for a requirement the job did not state', () => {
    fc.assert(
      fc.property(jobArb, candidateArb, (job, candidate) => {
        const result = scoreCandidate(job, candidate);
        const statedSkillLabels = new Set(
          (job.skills?.requirements ?? []).map((r) => r.label.toLowerCase()),
        );

        for (const gap of [
          ...result.explanation.gaps.mustHave,
          ...result.explanation.gaps.preferred,
        ]) {
          if (gap.dimension !== 'skills') continue;
          expect(
            statedSkillLabels.has(gap.label.toLowerCase()),
            `gap "${gap.label}" was not a stated requirement of job ${job.id}`,
          ).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('never claims a requirement is MET while also reporting it as a gap (H-054)', () => {
    // WHY THIS IS SCOPED TO `meets_requirement` RATHER THAN ALL STRENGTHS,
    // stated so it is not mistaken for a property weakened to make it pass.
    // The first version asserted that no dimension+label could be both a
    // strength and a gap, and it failed on a LEGITIMATE case: a job
    // must-having `project-management` against a candidate with `leadership`
    // produces a RELATED skill match. Reporting "related evidence found, but
    // the must-have is not satisfied" is informative and true — a partial
    // match is honestly both.
    //
    // `meets_requirement` is different in kind: it is an ABSOLUTE claim and
    // cannot coexist with a shortfall for the same thing. That is the real
    // defect this found (H-054) — a candidate holding the required degree but
    // missing a certification was shown "Education & Certifications: meets
    // requirement" beside "Requires at least a high_school degree (50% met)",
    // which contradicted itself AND blamed the degree the candidate had.
    fc.assert(
      fc.property(jobArb, candidateArb, (job, candidate) => {
        const result = scoreCandidate(job, candidate);
        const metClaims = new Set(
          result.explanation.strengths
            .filter((s) => s.matchType === 'meets_requirement')
            .map((s) => `${s.dimension}:${s.label.toLowerCase()}`),
        );

        for (const gap of [
          ...result.explanation.gaps.mustHave,
          ...result.explanation.gaps.preferred,
        ]) {
          expect(
            metClaims.has(`${gap.dimension}:${gap.label.toLowerCase()}`),
            `"${gap.label}" is claimed as MET and reported as a gap in the same explanation`,
          ).toBe(false);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('every must-have gap corresponds to an actual eligibility failure', () => {
    // A must-have gap is the reason a candidate is placed in the ineligible
    // group. If the explanation lists one, the eligibility result must agree,
    // or the recruiter is being told a candidate failed for a reason the
    // engine did not actually apply.
    fc.assert(
      fc.property(jobArb, candidateArb, (job, candidate) => {
        const result = scoreCandidate(job, candidate);
        if (result.explanation.gaps.mustHave.length > 0) {
          expect(result.eligibility.eligible).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });
});
