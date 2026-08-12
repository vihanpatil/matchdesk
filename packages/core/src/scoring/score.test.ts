import { describe, expect, it } from 'vitest';

import type { SkillAttribute, YearsExperienceAttribute } from '../extraction/types.js';
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

  it('does not throw and scores 0 for a job with zero active dimensions', () => {
    const job: Job = { id: 'j1' };
    const result = scoreCandidate(job, candidate('c1', '2026-01-01T00:00:00.000Z', []));
    expect(result.score).toBe(0);
    expect(result.dimensions).toEqual([]);
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
