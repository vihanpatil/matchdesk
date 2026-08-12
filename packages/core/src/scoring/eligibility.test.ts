import { describe, expect, it } from 'vitest';

import type {
  CertificationAttribute,
  EducationAttribute,
  ExtractedAttribute,
  SkillAttribute,
  YearsExperienceAttribute,
} from '../extraction/types.js';
import { evaluateEligibility } from './eligibility.js';
import type { Candidate, Job } from './types.js';

function skill(canonicalId: string): SkillAttribute {
  return {
    kind: 'skill',
    value: canonicalId,
    normalizedValue: canonicalId,
    confidence: 0.9,
    sourceSpan: { start: 0, end: 5 },
    canonicalId,
    matchType: 'exact',
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

function education(degreeLevel: EducationAttribute['degreeLevel']): EducationAttribute {
  return {
    kind: 'education',
    value: degreeLevel,
    normalizedValue: degreeLevel,
    confidence: 0.9,
    sourceSpan: { start: 0, end: 5 },
    degreeLevel,
    field: null,
  };
}

function cert(canonicalId: string): CertificationAttribute {
  return {
    kind: 'certification',
    value: canonicalId,
    normalizedValue: canonicalId,
    confidence: 0.9,
    sourceSpan: { start: 0, end: 5 },
    canonicalId,
  };
}

function candidate(attributes: readonly ExtractedAttribute[], id = 'c1'): Candidate {
  return { id, createdAt: '2026-01-01T00:00:00.000Z', attributes };
}

describe('evaluateEligibility', () => {
  it('is eligible when every must-have skill is met', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
        ],
      },
    };
    const result = evaluateEligibility(job, candidate([skill('postgresql')]));
    expect(result.eligible).toBe(true);
    expect(result.unmet).toEqual([]);
  });

  it('is ineligible and names the unmet requirement when a must-have skill is missing', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
        ],
      },
    };
    const result = evaluateEligibility(job, candidate([]));
    expect(result.eligible).toBe(false);
    expect(result.unmet).toHaveLength(1);
    expect(result.unmet[0]?.dimension).toBe('skills');
    expect(result.unmet[0]?.label).toBe('PostgreSQL');
  });

  it('a merely "related" skill match does NOT satisfy a must-have (only exact/alias do)', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
        ],
      },
    };
    // candidate only has the related "sql" skill, not postgresql itself.
    const result = evaluateEligibility(job, candidate([skill('sql')]));
    expect(result.eligible).toBe(false);
  });

  it('does NOT gate on a preferred (non-must-have) skill', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [{ id: 'r1', canonicalSkillId: 'react', label: 'React', mustHave: false }],
      },
    };
    const result = evaluateEligibility(job, candidate([]));
    expect(result.eligible).toBe(true);
  });

  it('gates on a must-have minimum years of experience', () => {
    const job: Job = {
      id: 'j1',
      experience: { weight: 1, requirement: { minYears: 5, mustHave: true } },
    };
    expect(evaluateEligibility(job, candidate([years(2)])).eligible).toBe(false);
    expect(evaluateEligibility(job, candidate([years(5)])).eligible).toBe(true);
  });

  it('does not gate on experience when mustHave is not set', () => {
    const job: Job = { id: 'j1', experience: { weight: 1, requirement: { minYears: 5 } } };
    expect(evaluateEligibility(job, candidate([years(0)])).eligible).toBe(true);
  });

  it('gates on a must-have seniority level', () => {
    const job: Job = {
      id: 'j1',
      seniority: { weight: 1, requirement: { level: 'senior', mustHave: true } },
    };
    expect(evaluateEligibility(job, candidate([years(1)])).eligible).toBe(false);
    expect(evaluateEligibility(job, candidate([years(6)])).eligible).toBe(true);
  });

  it('gates on a must-have minimum degree level', () => {
    const job: Job = {
      id: 'j1',
      educationCerts: { weight: 1, requirement: { minDegreeLevel: 'bachelor', mustHave: true } },
    };
    expect(evaluateEligibility(job, candidate([education('high_school')])).eligible).toBe(false);
    expect(evaluateEligibility(job, candidate([education('bachelor')])).eligible).toBe(true);
  });

  it('always gates on required certifications, regardless of the mustHave flag on degree level', () => {
    const job: Job = {
      id: 'j1',
      educationCerts: {
        weight: 1,
        requirement: { minDegreeLevel: 'high_school', requiredCertifications: ['pmp'] },
      },
    };
    expect(evaluateEligibility(job, candidate([])).eligible).toBe(false);
    expect(evaluateEligibility(job, candidate([cert('pmp')])).eligible).toBe(true);
  });

  it('is eligible by default for a job with no requirements at all', () => {
    const job: Job = { id: 'j1' };
    expect(evaluateEligibility(job, candidate([])).eligible).toBe(true);
  });

  it('reports every unmet requirement, not just the first', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
        ],
      },
      experience: { weight: 1, requirement: { minYears: 5, mustHave: true } },
    };
    const result = evaluateEligibility(job, candidate([]));
    expect(result.unmet.length).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic across repeated calls', () => {
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
        ],
      },
    };
    const c = candidate([]);
    expect(evaluateEligibility(job, c)).toEqual(evaluateEligibility(job, c));
  });
});
