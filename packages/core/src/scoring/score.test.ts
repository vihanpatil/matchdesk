import { describe, expect, it } from 'vitest';

import type {
  ExtractedAttribute,
  SkillAttribute,
  UnreadableDateRangeAttribute,
  UnreadableSectionAttribute,
  YearsExperienceAttribute,
} from '../extraction/types.js';
import { rankCandidates, scoreCandidate } from './score.js';
import type { Candidate, Job } from './types.js';

function skill(canonicalId: string, matchType: 'exact' | 'alias' = 'exact'): SkillAttribute {
  return {
    kind: 'skill',
    value: canonicalId,
    normalizedValue: canonicalId,
    confidence: 0.9,
    sourceSpan: { start: 0, end: 5 },
    canonicalId,
    matchType,
  };
}

function years(n: number): YearsExperienceAttribute {
  return {
    kind: 'years_experience',
    value: `${String(n)} years`,
    normalizedValue: String(n),
    confidence: 0.9,
    sourceSpan: { start: 0, end: 5 },
    years: n,
  };
}

function candidate(
  id: string,
  createdAt: string,
  attributes: readonly (SkillAttribute | YearsExperienceAttribute)[] = [],
): Candidate {
  return { id, createdAt, attributes };
}

describe('scoreCandidate', () => {
  it('scores 100 when every active dimension is perfectly satisfied', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
        ],
      },
    };
    const result = scoreCandidate(
      job,
      candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
    );
    expect(result.score).toBe(100);
    expect(result.raw).toBe(1);
  });

  it('scores 0 when nothing matches', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
        ],
      },
    };
    const result = scoreCandidate(job, candidate('c1', '2026-01-01T00:00:00.000Z', []));
    expect(result.score).toBe(0);
  });

  it('the score is always an integer in [0, 100]', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
          { id: 'r2', canonicalSkillId: 'react', label: 'React', mustHave: false },
          { id: 'r3', canonicalSkillId: 'docker', label: 'Docker', mustHave: false },
        ],
      },
    };
    const result = scoreCandidate(
      job,
      candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
    );
    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('a dimension is active only when the JOB states a requirement for it (ADR-005) — never from candidate attributes', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
        ],
      },
    };
    // Candidate has education and years-of-experience attributes, but the
    // job never mentioned those dimensions — they must not appear at all.
    const result = scoreCandidate(
      job,
      candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql'), years(10)]),
    );
    expect(result.dimensions.map((d) => d.dimension)).toEqual(['skills']);
  });

  it('renormalizes weights across active dimensions', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 2,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
        ],
      },
      seniority: { weight: 1, requirement: { level: 'junior' } },
    };
    const result = scoreCandidate(
      job,
      candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
    );
    const skillsDim = result.dimensions.find((d) => d.dimension === 'skills');
    const seniorityDim = result.dimensions.find((d) => d.dimension === 'seniority');
    expect(skillsDim?.weight).toBeCloseTo(2 / 3, 6);
    expect(seniorityDim?.weight).toBeCloseTo(1 / 3, 6);
  });

  it('dimension contributions sum to the total raw score (± rounding)', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
        ],
      },
      seniority: { weight: 1, requirement: { level: 'senior' } },
    };
    const result = scoreCandidate(
      job,
      candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
    );
    const sum = result.dimensions.reduce((acc, d) => acc + d.contribution, 0);
    expect(sum).toBeCloseTo(result.raw, 6);
    expect(result.explanation.composition.total).toBeCloseTo(result.raw, 6);
  });

  /**
   * REPLACES a test that asserted the opposite: "does not throw and scores 0
   * for a job with zero active dimensions".
   *
   * That behaviour was deliberate and codified, which is why it survived — but
   * it was wrong. Measured: score 0 with `eligible: true`, for every candidate,
   * against a job that stated no requirement of any kind. Zero is a claim about
   * a person, and a recruiter cannot tell it apart from a real no-match
   * (H-028 D8, closed by H-066). No number is defensible here, so the engine
   * refuses to produce one rather than picking an arbitrary default.
   */
  it('throws for a job that activates no scoring dimension', () => {
    const job: Job = { id: 'j1' };
    expect(() => scoreCandidate(job, candidate('c1', '2026-01-01T00:00:00.000Z', []))).toThrow(
      /activates no scoring dimension/,
    );
  });

  it('still scores a job that states a requirement but matches nothing', () => {
    // The contrast that makes the rule above meaningful: a job that DID ask for
    // something and got no match legitimately scores 0. That number is a real
    // statement about the candidate, and it must not be swept up by the guard.
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [{ id: 'r1', canonicalSkillId: 'python', label: 'Python', mustHave: false }],
      },
    };
    const result = scoreCandidate(job, candidate('c1', '2026-01-01T00:00:00.000Z', []));
    expect(result.score).toBe(0);
    expect(result.dimensions).toHaveLength(1);
  });

  it('does not throw when every active dimension has weight 0 (falls back to equal weighting)', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 0,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
        ],
      },
      seniority: { weight: 0, requirement: { level: 'junior' } },
    };
    expect(() =>
      scoreCandidate(job, candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')])),
    ).not.toThrow();
  });

  it('adding a matched requirement never decreases the score (monotonicity spot check)', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
          { id: 'r2', canonicalSkillId: 'react', label: 'React', mustHave: false },
        ],
      },
    };
    const before = scoreCandidate(
      job,
      candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
    ).score;
    const after = scoreCandidate(
      job,
      candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql'), skill('react')]),
    ).score;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('is deterministic across repeated calls', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
        ],
      },
    };
    const c = candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]);
    expect(scoreCandidate(job, c)).toEqual(scoreCandidate(job, c));
  });
});

describe('rankCandidates', () => {
  const job: Job = {
    id: 'j1',
    skills: {
      weight: 1,
      requirements: [
        { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
      ],
    },
  };

  it('partitions candidates into eligible and ineligible groups', () => {
    const eligible = candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]);
    const ineligible = candidate('c2', '2026-01-01T00:00:00.000Z', []);
    const result = rankCandidates(job, [eligible, ineligible]);
    expect(result.eligible.map((r) => r.candidateId)).toEqual(['c1']);
    expect(result.ineligible.map((r) => r.candidateId)).toEqual(['c2']);
  });

  it('an ineligible candidate can never outrank an eligible one, regardless of score', () => {
    // c2 is ineligible (missing the must-have) but would otherwise score
    // higher on a preferred dimension if it entered the weighted sum.
    const jobWithPreferred: Job = {
      id: 'j2',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
          { id: 'r2', canonicalSkillId: 'react', label: 'React', mustHave: false },
        ],
      },
    };
    const eligibleLowScore = candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]);
    const ineligibleHighScore = candidate('c2', '2026-01-01T00:00:00.000Z', [skill('react')]);
    const result = rankCandidates(jobWithPreferred, [eligibleLowScore, ineligibleHighScore]);
    expect(result.eligible.map((r) => r.candidateId)).toEqual(['c1']);
    expect(result.ineligible.map((r) => r.candidateId)).toEqual(['c2']);
    // Structural: every eligible result outranks every ineligible one by
    // construction (separate arrays), independent of their numeric scores.
    expect(result.ineligible[0]?.score).toBeGreaterThanOrEqual(result.eligible[0]?.score ?? 0);
  });

  it('sorts each group by score desc, then createdAt asc, then id asc', () => {
    const a = candidate('b', '2026-01-02T00:00:00.000Z', [skill('postgresql')]);
    const b = candidate('a', '2026-01-01T00:00:00.000Z', [skill('postgresql')]);
    const result = rankCandidates(job, [a, b]);
    // Same score (both eligible, both match); tie broken by createdAt asc.
    expect(result.eligible.map((r) => r.candidateId)).toEqual(['a', 'b']);
  });

  it('breaks a same-score, same-createdAt tie by id ascending', () => {
    const a = candidate('zeta', '2026-01-01T00:00:00.000Z', [skill('postgresql')]);
    const b = candidate('alpha', '2026-01-01T00:00:00.000Z', [skill('postgresql')]);
    const result = rankCandidates(job, [a, b]);
    expect(result.eligible.map((r) => r.candidateId)).toEqual(['alpha', 'zeta']);
  });

  it('treats two literally identical candidates (same score, createdAt and id) as a full tie', () => {
    const c = candidate('dup', '2026-01-01T00:00:00.000Z', [skill('postgresql')]);
    const result = rankCandidates(job, [c, { ...c }]);
    expect(result.eligible).toHaveLength(2);
    expect(result.eligible.every((r) => r.candidateId === 'dup')).toBe(true);
  });

  it('does not throw for an empty candidate list', () => {
    expect(rankCandidates(job, [])).toEqual({ eligible: [], ineligible: [] });
  });

  it('is deterministic across repeated calls', () => {
    const candidates = [
      candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
      candidate('c2', '2026-01-02T00:00:00.000Z', []),
    ];
    expect(rankCandidates(job, candidates)).toEqual(rankCandidates(job, candidates));
  });

  it('shuffling the input candidate order never changes the ranking', () => {
    const candidates = [
      candidate('c1', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
      candidate('c2', '2026-01-02T00:00:00.000Z', []),
      candidate('c3', '2026-01-03T00:00:00.000Z', [skill('postgresql')]),
    ];
    const forward = rankCandidates(job, candidates);
    const reversed = rankCandidates(job, candidates.slice().reverse());
    expect(reversed).toEqual(forward);
  });
});

describe('ADR-017: must-have requirements both score and partition', () => {
  // The exact live-probe scenario from ADR-017: PostgreSQL is must-have,
  // React is preferred. "weak" meets the hard requirement only; "strong"
  // meets the preferred requirement only.
  const job: Job = {
    id: 'j1',
    skills: {
      weight: 1,
      requirements: [
        { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
        { id: 'r2', canonicalSkillId: 'react', label: 'React', mustHave: false },
      ],
    },
  };

  it('a must-have requirement contributes to its dimension subscore exactly like a preferred one', () => {
    const weak = scoreCandidate(
      job,
      candidate('weak', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
    );
    const strong = scoreCandidate(
      job,
      candidate('strong', '2026-01-01T00:00:00.000Z', [skill('react')]),
    );

    // Each candidate met exactly 1 of the 2 skill requirements, so both
    // should land at the same ~50% subscore — must-have no longer excluded.
    expect(weak.score).toBe(50);
    expect(strong.score).toBe(50);
  });

  it('"weak" (meets the must-have) is eligible; "strong" (fails the must-have) is not — despite equal scores', () => {
    const weak = scoreCandidate(
      job,
      candidate('weak', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
    );
    const strong = scoreCandidate(
      job,
      candidate('strong', '2026-01-01T00:00:00.000Z', [skill('react')]),
    );

    expect(weak.eligibility.eligible).toBe(true);
    expect(strong.eligibility.eligible).toBe(false);
  });

  it('the old ADR-007 bug does not reproduce: the candidate who meets the hard requirement never shows 0 while a candidate who fails it shows 100', () => {
    const weak = scoreCandidate(
      job,
      candidate('weak', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
    );
    const strong = scoreCandidate(
      job,
      candidate('strong', '2026-01-01T00:00:00.000Z', [skill('react')]),
    );
    expect(weak.score).not.toBe(0);
    expect(strong.score).not.toBe(100);
  });

  it('an ineligible candidate can still numerically outscore an eligible one, yet the partition still holds it below (structural guarantee, not score-derived)', () => {
    // 3 skill requirements: A must-have, B and C preferred. "weak" meets
    // only A (eligible, subscore 1/3). "strong" meets B and C but not A
    // (ineligible, subscore 2/3) — strictly higher raw score.
    const threeSkillJob: Job = {
      id: 'j2',
      skills: {
        weight: 1,
        requirements: [
          { id: 'a', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
          { id: 'b', canonicalSkillId: 'react', label: 'React', mustHave: false },
          { id: 'c', canonicalSkillId: 'docker', label: 'Docker', mustHave: false },
        ],
      },
    };
    const weak = candidate('weak', '2026-01-01T00:00:00.000Z', [skill('postgresql')]);
    const strong = candidate('strong', '2026-01-01T00:00:00.000Z', [
      skill('react'),
      skill('docker'),
    ]);
    const result = rankCandidates(threeSkillJob, [weak, strong]);

    const weakResult = result.eligible.find((r) => r.candidateId === 'weak');
    const strongResult = result.ineligible.find((r) => r.candidateId === 'strong');
    expect(weakResult).toBeDefined();
    expect(strongResult).toBeDefined();
    // Numerically, ineligible "strong" outscores eligible "weak" — proving
    // the guarantee comes from the grouping, not from the score.
    expect(strongResult?.score).toBeGreaterThan(weakResult?.score ?? 100);
    // Yet strong never appears in the eligible array, and weak never
    // appears in the ineligible array — structural, not score-derived.
    expect(result.eligible.some((r) => r.candidateId === 'strong')).toBe(false);
    expect(result.ineligible.some((r) => r.candidateId === 'weak')).toBe(false);
  });

  it('a met must-have skill appears in the strengths breakdown with a nonzero contribution', () => {
    const weak = scoreCandidate(
      job,
      candidate('weak', '2026-01-01T00:00:00.000Z', [skill('postgresql')]),
    );
    const pgStrength = weak.explanation.strengths.find((s) => s.label === 'PostgreSQL');
    expect(pgStrength).toBeDefined();
    expect(pgStrength?.contribution).toBeGreaterThan(0);
  });
});

describe('weight validation (H-050)', () => {
  const candidate = { id: 'c', createdAt: '2026-01-01T00:00:00.000Z', attributes: [] };

  it('refuses a negative dimension weight rather than producing a score', () => {
    // Measured before this guard existed: skills.weight = -5 produced a score
    // of 100 out of 100, persisted as a match. A negative weight rewards a
    // candidate for NOT matching, which cannot be shown as a match score.
    expect(() =>
      scoreCandidate({ id: 'j', skills: { weight: -5, requirements: [] } }, candidate),
    ).toThrow(/negative/i);
  });

  it('refuses a non-finite weight', () => {
    expect(() =>
      scoreCandidate({ id: 'j', skills: { weight: Number.NaN, requirements: [] } }, candidate),
    ).toThrow(/non-finite/i);
  });

  it('still accepts a zero weight, which is a legitimate way to disable a dimension', () => {
    expect(() =>
      scoreCandidate({ id: 'j', skills: { weight: 0, requirements: [] } }, candidate),
    ).not.toThrow();
  });
});

describe('reservations (H-040, ADR-029)', () => {
  const attrs = (claimed: number, verified: number): YearsExperienceAttribute[] => [
    {
      kind: 'years_experience',
      years: claimed,
      isExplicitStatement: true,
      value: `${String(claimed)} years`,
      normalizedValue: String(claimed),
      confidence: 1,
      sourceSpan: { start: 0, end: 1 },
    },
    {
      kind: 'years_experience',
      years: verified,
      isExplicitStatement: false,
      value: 'Jan 2023 - Dec 2025',
      normalizedValue: String(verified),
      confidence: 1,
      sourceSpan: { start: 2, end: 3 },
    },
  ];

  const candidate = (claimed: number, verified: number): Candidate => ({
    id: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    attributes: attrs(claimed, verified),
  });

  it('BLOCKS when the discarded claim would flip a must-have eligibility verdict', () => {
    // The measured H-040 case: verified 2.9 fails a 9-year must-have, the
    // document says 20, and the recruiter was shown "found 2.9" as the reason.
    const job: Job = {
      id: 'j1',
      experience: { weight: 1, requirement: { minYears: 9, mustHave: true } },
    };
    const result = scoreCandidate(job, candidate(20, 2.9));
    const blocking = result.reservations.filter((r) => r.blocking);

    expect(blocking).toHaveLength(1);
    const first = blocking[0];
    expect(first?.kind).toBe('unverified_tenure_claim');
    // Reservation is a discriminated union (E3, ADR-029); narrow before
    // reading the `unverified_tenure_claim`-only fields.
    if (first?.kind !== 'unverified_tenure_claim') {
      throw new Error('expected an unverified_tenure_claim reservation');
    }
    expect(first.claimed).toBe(20);
    expect(first.computed).toBe(2.9);
    // Names both numbers, so the recruiter can see the disagreement itself
    // rather than a bare "provisional" flag.
    expect(first.detail).toContain('2.9');
    expect(first.detail).toContain('20');
  });

  it('does NOT block when the claim would not change the verdict', () => {
    // Verified tenure already clears the bar, so the discarded claim cannot
    // flip anything. Still reported — a non-blocking reservation can move the
    // SCORE without moving eligibility, which is stated, not hidden.
    const job: Job = {
      id: 'j1',
      experience: { weight: 1, requirement: { minYears: 2, mustHave: true } },
    };
    const result = scoreCandidate(job, candidate(20, 2.9));
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0]?.blocking).toBe(false);
  });

  it('does NOT block when tenure is not a must-have, because eligibility cannot turn on it', () => {
    const job: Job = {
      id: 'j1',
      experience: { weight: 1, requirement: { minYears: 9 } },
    };
    const result = scoreCandidate(job, candidate(20, 2.9));
    expect(result.reservations[0]?.blocking).toBe(false);
  });

  it('is empty for a candidate whose dates all parsed', () => {
    const job: Job = {
      id: 'j1',
      experience: { weight: 1, requirement: { minYears: 9, mustHave: true } },
    };
    const clean: Candidate = {
      id: 'c2',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [
        {
          kind: 'years_experience',
          years: 12,
          isExplicitStatement: false,
          value: 'Jan 2014 - Jan 2026',
          normalizedValue: '12',
          confidence: 1,
          sourceSpan: { start: 0, end: 1 },
        } satisfies YearsExperienceAttribute,
      ],
    };
    expect(scoreCandidate(job, clean).reservations).toEqual([]);
  });
});

describe('H-036 hardening: reservation-blocking boundaries, exactly at the bar', () => {
  // Mutation testing (2026-08-17) showed both `flips` conditions in
  // reservationsFor carried surviving boundary mutants: no test placed
  // `minYears` exactly ON either edge. Whether a reservation BLOCKS is the
  // difference between a candidate appearing ranked and appearing held back
  // — recruiter-visible. Every expectation below was measured before it was
  // written (H-109).
  const yrs = (years: number, explicit: boolean, s: number): YearsExperienceAttribute => ({
    kind: 'years_experience',
    years,
    isExplicitStatement: explicit,
    value: `${String(years)} years`,
    normalizedValue: String(years),
    confidence: 1,
    sourceSpan: { start: s, end: s + 1 },
  });
  const unread = (minPossibleYears: number, s: number): UnreadableDateRangeAttribute => ({
    kind: 'unreadable_date_range',
    minPossibleYears,
    value: '03/04/2019 - 07/09/2024',
    normalizedValue: String(minPossibleYears),
    confidence: 1,
    sourceSpan: { start: s, end: s + 1 },
  });
  const cand = (attributes: readonly ExtractedAttribute[]): Candidate => ({
    id: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    attributes,
  });
  const job = (minYears: number): Job => ({
    id: 'j1',
    experience: { weight: 1, requirement: { minYears, mustHave: true } },
  });

  it('discarded claim: minYears EXACTLY equal to verified tenure does not block — the bar is already met', () => {
    const r = scoreCandidate(job(2.9), cand([yrs(20, true, 0), yrs(2.9, false, 2)]));
    expect(r.eligibility.eligible).toBe(true);
    expect(r.reservations[0]?.kind).toBe('unverified_tenure_claim');
    expect(r.reservations[0]?.blocking).toBe(false);
  });

  it('discarded claim: minYears EXACTLY equal to the claim blocks — reading the dates could flip the verdict', () => {
    const r = scoreCandidate(job(20), cand([yrs(20, true, 0), yrs(2.9, false, 2)]));
    expect(r.eligibility.eligible).toBe(false);
    expect(r.reservations[0]?.blocking).toBe(true);
  });

  it('unreadable dates: minYears EXACTLY equal to verified tenure does not block', () => {
    const r = scoreCandidate(job(3), cand([yrs(3, false, 0), unread(5.2, 2)]));
    expect(r.eligibility.eligible).toBe(true);
    expect(r.reservations[0]?.kind).toBe('unreadable_employment_dates');
    expect(r.reservations[0]?.blocking).toBe(false);
  });

  it('unreadable dates: minYears EXACTLY equal to verified + lower bound blocks — the bound just reaches the bar', () => {
    const r = scoreCandidate(job(8.2), cand([yrs(3, false, 0), unread(5.2, 2)]));
    expect(r.eligibility.eligible).toBe(false);
    expect(r.reservations[0]?.blocking).toBe(true);
  });

  it('unreadable dates: minYears just above the bound does not block — even the bound cannot reach it', () => {
    const r = scoreCandidate(job(8.3), cand([yrs(3, false, 0), unread(5.2, 2)]));
    expect(r.eligibility.eligible).toBe(false);
    expect(r.reservations[0]?.blocking).toBe(false);
  });
});

describe('unsupported negatives (H-041, ADR-029 principle)', () => {
  const unreadEducation = (): UnreadableSectionAttribute => ({
    kind: 'unreadable_section',
    value: 'Diplom Wirtschaftsinformatik, Universitaet Mannheim',
    normalizedValue: 'education',
    confidence: 1,
    sourceSpan: { start: 0, end: 51 },
    section: 'education',
  });

  const degreeJob = (): Job => ({
    id: 'j1',
    educationCerts: {
      weight: 1,
      requirement: { minDegreeLevel: 'bachelor', mustHave: true },
    },
  });

  it('BLOCKS when a must-have is unmet and that section could not be read', () => {
    // The H-041 harm, end to end. A foreign degree line yields no education
    // attribute, so the engine reported "Requires at least a bachelor degree"
    // — asserting a negative from silence about someone who holds one, and
    // flipping the same person between 100/eligible and 50/ineligible on
    // nothing but the language their degree was written in.
    const result = scoreCandidate(degreeJob(), {
      id: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [unreadEducation()],
    });

    expect(result.eligibility.eligible).toBe(false);
    const reservation = result.reservations.find((r) => r.kind === 'unsupported_negative');
    expect(reservation).toBeDefined();
    expect(reservation?.blocking).toBe(true);
    // `scoreStoredPair` and the batch path both refuse on ANY blocking
    // reservation (H-099), so this is what stops the wrong verdict reaching a
    // recruiter or the `matches` table.
    expect(reservation?.detail).toContain('could not read');
  });

  it('does NOT block a candidate who simply has no degree', () => {
    // The distinction the whole mechanism exists to draw. Same job, same empty
    // education evidence — but nothing unread, so the engine really did read
    // this candidate and they really do not meet the requirement. Blocking
    // here would refuse every trades candidate in the corpus.
    const result = scoreCandidate(degreeJob(), candidate('c2', '2026-01-01T00:00:00.000Z', []));

    expect(result.eligibility.eligible).toBe(false);
    expect(result.reservations.filter((r) => r.kind === 'unsupported_negative')).toEqual([]);
  });

  it('does NOT block when the unread section is irrelevant to the unmet requirement', () => {
    // An unread SKILLS line says nothing about whether the candidate has a
    // degree. Materiality is what makes this a reservation rather than a
    // blanket refusal (ADR-029).
    const result = scoreCandidate(degreeJob(), {
      id: 'c3',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [{ ...unreadEducation(), normalizedValue: 'skills', section: 'skills' }],
    });

    expect(result.reservations.filter((r) => r.kind === 'unsupported_negative')).toEqual([]);
  });

  it('does NOT block when the must-have is MET despite unread text', () => {
    const result = scoreCandidate(degreeJob(), {
      id: 'c4',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [
        unreadEducation(),
        {
          kind: 'education',
          value: 'BSc Computer Science',
          normalizedValue: 'bachelor',
          confidence: 0.9,
          sourceSpan: { start: 0, end: 5 },
          degreeLevel: 'bachelor',
          field: 'computer-science',
        },
      ],
    });

    expect(result.eligibility.eligible).toBe(true);
    expect(result.reservations.filter((r) => r.kind === 'unsupported_negative')).toEqual([]);
  });
});
