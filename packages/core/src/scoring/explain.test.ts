import { describe, expect, it } from 'vitest';

import type { SkillAttribute } from '../extraction/types.js';
import { matchAllSkillRequirements } from './dimensions.js';
import { buildExplanation } from './explain.js';
import type { Candidate, DimensionContribution, EligibilityResult, Job } from './types.js';

function skill(canonicalId: string, start = 0, end = 5): SkillAttribute {
  return {
    kind: 'skill',
    value: canonicalId,
    normalizedValue: canonicalId,
    confidence: 0.9,
    sourceSpan: { start, end },
    canonicalId,
    matchType: 'exact',
  };
}

const NO_UNMET: EligibilityResult = { eligible: true, unmet: [] };

describe('buildExplanation', () => {
  it('ranks strengths descending by contribution', () => {
    const skillsSpec = {
      weight: 1,
      requirements: [
        { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: false },
        { id: 'r2', canonicalSkillId: 'react', label: 'React', mustHave: false },
      ],
    };
    const job: Job = { id: 'j1', skills: skillsSpec };
    const candidate: Candidate = {
      id: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [skill('postgresql', 0, 10)], // react unmatched -> only postgresql contributes
    };
    const skillMatches = matchAllSkillRequirements(skillsSpec, [skill('postgresql', 0, 10)]);
    const dims: readonly DimensionContribution[] = [
      { dimension: 'skills', weight: 1, subscore: 0.5, contribution: 0.5 },
    ];
    const explanation = buildExplanation({
      job,
      candidate,
      dimensions: dims,
      skillMatches,
      eligibility: NO_UNMET,
    });

    expect(explanation.strengths.length).toBeGreaterThan(0);
    for (let i = 1; i < explanation.strengths.length; i += 1) {
      const prevItem = explanation.strengths[i - 1];
      const currItem = explanation.strengths[i];
      expect(prevItem).toBeDefined();
      expect(currItem).toBeDefined();
      if (prevItem && currItem)
        expect(prevItem.contribution).toBeGreaterThanOrEqual(currItem.contribution);
    }

    const pg = explanation.strengths.find((s) => s.label === 'PostgreSQL');
    expect(pg?.matchType).toBe('exact');
    expect(pg?.evidence).toEqual({ start: 0, end: 10 });
  });

  it('splits gaps into mustHave and preferred', () => {
    const skillsSpec = {
      weight: 1,
      requirements: [{ id: 'r1', canonicalSkillId: 'react', label: 'React', mustHave: false }],
    };
    const job: Job = { id: 'j1', skills: skillsSpec };
    const candidate: Candidate = {
      id: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [],
    };
    const skillMatches = matchAllSkillRequirements(skillsSpec, []);
    const eligibility: EligibilityResult = {
      eligible: false,
      unmet: [
        {
          dimension: 'skills',
          label: 'PostgreSQL',
          reason: 'Must-have skill "PostgreSQL" was not found.',
        },
      ],
    };
    const dims: readonly DimensionContribution[] = [
      { dimension: 'skills', weight: 1, subscore: 0, contribution: 0 },
    ];
    const explanation = buildExplanation({
      job,
      candidate,
      dimensions: dims,
      skillMatches,
      eligibility,
    });

    expect(explanation.gaps.mustHave).toHaveLength(1);
    expect(explanation.gaps.mustHave[0]?.label).toBe('PostgreSQL');
    expect(explanation.gaps.preferred.some((g) => g.label === 'React')).toBe(true);
  });

  it('composition dimension contributions sum to the total (± rounding)', () => {
    const job: Job = { id: 'j1' };
    const candidate: Candidate = {
      id: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [],
    };
    const dims: readonly DimensionContribution[] = [
      { dimension: 'skills', weight: 0.5, subscore: 0.8, contribution: 0.4 },
      { dimension: 'seniority', weight: 0.5, subscore: 0.6, contribution: 0.3 },
    ];
    const explanation = buildExplanation({
      job,
      candidate,
      dimensions: dims,
      skillMatches: [],
      eligibility: NO_UNMET,
    });
    expect(explanation.composition.dimensions).toEqual(dims);
    expect(explanation.composition.total).toBeCloseTo(0.7, 6);
  });

  it('includes an honest caveat about the experience_relevance proxy only when that dimension is active', () => {
    const jobWithExperience: Job = {
      id: 'j1',
      experience: { weight: 1, requirement: { minYears: 3 } },
    };
    const jobWithout: Job = { id: 'j2' };
    const candidate: Candidate = {
      id: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [],
    };

    const withExp = buildExplanation({
      job: jobWithExperience,
      candidate,
      dimensions: [{ dimension: 'experience_relevance', weight: 1, subscore: 0, contribution: 0 }],
      skillMatches: [],
      eligibility: NO_UNMET,
    });
    const without = buildExplanation({
      job: jobWithout,
      candidate,
      dimensions: [],
      skillMatches: [],
      eligibility: NO_UNMET,
    });

    expect(withExp.caveats.some((c) => c.toLowerCase().includes('proxy'))).toBe(true);
    expect(without.caveats.some((c) => c.toLowerCase().includes('experience_relevance'))).toBe(
      false,
    );
  });

  it('produces no strengths and no gaps for a job with no requirements', () => {
    const job: Job = { id: 'j1' };
    const candidate: Candidate = {
      id: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [],
    };
    const explanation = buildExplanation({
      job,
      candidate,
      dimensions: [],
      skillMatches: [],
      eligibility: NO_UNMET,
    });
    expect(explanation.strengths).toEqual([]);
    expect(explanation.gaps.mustHave).toEqual([]);
    expect(explanation.gaps.preferred).toEqual([]);
  });

  it('does not throw on degenerate input', () => {
    const job: Job = { id: 'j1' };
    const candidate: Candidate = {
      id: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes: [],
    };
    expect(() =>
      buildExplanation({ job, candidate, dimensions: [], skillMatches: [], eligibility: NO_UNMET }),
    ).not.toThrow();
  });
});
