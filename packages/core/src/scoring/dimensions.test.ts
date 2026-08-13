import { describe, expect, it } from 'vitest';

import type {
  CertificationAttribute,
  EducationAttribute,
  ExtractedAttribute,
  SkillAttribute,
  YearsExperienceAttribute,
} from '../extraction/types.js';
import {
  bestDegreeLevel,
  educationCertsSubscore,
  experienceRelevanceSubscore,
  hasCertification,
  inferSeniorityLevel,
  matchAllSkillRequirements,
  senioritySubscore,
  skillsSubscore,
  totalYearsExperience,
} from './dimensions.js';
import type { SkillRequirement } from './types.js';

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

function years(n: number, isExplicitStatement = false): YearsExperienceAttribute {
  return {
    kind: 'years_experience',
    value: `${String(n)} years`,
    normalizedValue: String(n),
    confidence: 0.9,
    sourceSpan: { start: 0, end: 5 },
    years: n,
    isExplicitStatement,
  };
}

function education(
  degreeLevel: EducationAttribute['degreeLevel'],
  field: string | null = null,
): EducationAttribute {
  return {
    kind: 'education',
    value: degreeLevel,
    normalizedValue: degreeLevel,
    confidence: 0.9,
    sourceSpan: { start: 0, end: 5 },
    degreeLevel,
    field,
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

function requirement(
  canonicalSkillId: string,
  mustHave: boolean,
  id = canonicalSkillId,
): SkillRequirement {
  return { id, canonicalSkillId, label: canonicalSkillId, mustHave };
}

describe('matchAllSkillRequirements / skillsSubscore', () => {
  it('matches every requirement against the candidate skills via the cascade', () => {
    const reqs = [requirement('postgresql', false), requirement('react', false)];
    const matches = matchAllSkillRequirements({ weight: 1, requirements: reqs }, [
      skill('postgresql'),
    ]);
    expect(matches).toHaveLength(2);
    expect(
      matches.find((m) => m.requirement.canonicalSkillId === 'postgresql')?.match.matchType,
    ).toBe('exact');
    expect(matches.find((m) => m.requirement.canonicalSkillId === 'react')?.match.matchType).toBe(
      'none',
    );
  });

  it('skillsSubscore averages EVERY requirement, must-have and preferred alike — ADR-017 (amends ADR-007)', () => {
    const reqs = [requirement('postgresql', true), requirement('react', false)];
    // Neither requirement is met: average is 0 regardless of mustHave.
    const matches = matchAllSkillRequirements({ weight: 1, requirements: reqs }, []);
    expect(skillsSubscore(matches)).toBe(0);

    // The must-have is now met (react preferred still unmet): the must-have
    // DOES enter the average under ADR-017, unlike the old ADR-007 rule
    // this test previously asserted (where it was excluded and this stayed
    // 0). One of two requirements met -> 0.5.
    const matchesWithMustHaveMet = matchAllSkillRequirements({ weight: 1, requirements: reqs }, [
      skill('postgresql'),
    ]);
    expect(skillsSubscore(matchesWithMustHaveMet)).toBe(0.5);
  });

  it('skillsSubscore counts a must-have requirement even when it is the only requirement in the dimension — ADR-017', () => {
    // Previously (ADR-007) this returned the "neutral" 1.0 because there
    // were no PREFERRED requirements to average, regardless of whether the
    // sole must-have was met. Under ADR-017 must-haves are real dimension
    // contributors, so an unmet lone must-have now correctly scores 0, and
    // a met one now correctly scores 1.
    const reqs = [requirement('postgresql', true)];
    const unmet = matchAllSkillRequirements({ weight: 1, requirements: reqs }, []);
    expect(skillsSubscore(unmet)).toBe(0);

    const met = matchAllSkillRequirements({ weight: 1, requirements: reqs }, [skill('postgresql')]);
    expect(skillsSubscore(met)).toBe(1);
  });

  it('skillsSubscore returns 1.0 for an empty requirement list', () => {
    expect(skillsSubscore([])).toBe(1);
  });
});

describe('totalYearsExperience', () => {
  it('sums every years_experience attribute', () => {
    const attrs: readonly ExtractedAttribute[] = [years(3), years(2)];
    expect(totalYearsExperience(attrs)).toBe(5);
  });

  it('is 0 when there is no years_experience attribute', () => {
    expect(totalYearsExperience([skill('postgresql')])).toBe(0);
  });

  // H-028 D5b: an explicit "N years of experience" statement and the date
  // ranges it describes must not both be added to the total — computed
  // tenure from date ranges wins when both are present, and the explicit
  // claim is treated as corroboration rather than an addend.
  it('prefers computed tenure from date ranges over an explicit statement when both are present', () => {
    const attrs: readonly ExtractedAttribute[] = [
      years(10, true), // "10 years of experience" (explicit claim)
      years(10, false), // Jan 2016 - Present
      years(3.9, false), // Jan 2012 - Dec 2015
    ];
    // True merged tenure is 10 + 3.9 = 13.9, NOT 10 + 10 + 3.9 = 23.9.
    expect(totalYearsExperience(attrs)).toBeCloseTo(13.9, 5);
  });

  it('falls back to the explicit statement when no date range is present', () => {
    const attrs: readonly ExtractedAttribute[] = [years(10, true)];
    expect(totalYearsExperience(attrs)).toBe(10);
  });

  it('takes the max, not the sum, of multiple explicit statements with no date ranges', () => {
    const attrs: readonly ExtractedAttribute[] = [years(5, true), years(8, true)];
    expect(totalYearsExperience(attrs)).toBe(8);
  });
});

describe('experienceRelevanceSubscore', () => {
  it('is 1.0 when the candidate meets or exceeds the required years', () => {
    expect(experienceRelevanceSubscore({ minYears: 5 }, 5)).toBe(1);
    expect(experienceRelevanceSubscore({ minYears: 5 }, 8)).toBe(1);
  });

  it('is proportional below the required years', () => {
    expect(experienceRelevanceSubscore({ minYears: 4 }, 2)).toBe(0.5);
  });

  it('is 1.0 when the job requires 0 years', () => {
    expect(experienceRelevanceSubscore({ minYears: 0 }, 0)).toBe(1);
  });

  it('never exceeds 1.0 or drops below 0', () => {
    expect(experienceRelevanceSubscore({ minYears: 5 }, 100)).toBe(1);
    expect(experienceRelevanceSubscore({ minYears: 5 }, 0)).toBe(0);
  });
});

describe('inferSeniorityLevel', () => {
  it('maps years of experience onto the seniority ladder via fixed thresholds', () => {
    expect(inferSeniorityLevel(0)).toBe('junior');
    expect(inferSeniorityLevel(3)).toBe('mid');
    expect(inferSeniorityLevel(6)).toBe('senior');
    expect(inferSeniorityLevel(9)).toBe('lead');
    expect(inferSeniorityLevel(15)).toBe('principal');
  });
});

describe('senioritySubscore', () => {
  it('is 1.0 when the candidate meets or exceeds the required level', () => {
    expect(senioritySubscore({ level: 'senior' }, 6)).toBe(1);
    expect(senioritySubscore({ level: 'senior' }, 15)).toBe(1);
  });

  it('is 1.0 whenever the required level is junior, regardless of years', () => {
    expect(senioritySubscore({ level: 'junior' }, 0)).toBe(1);
  });

  it('is proportional below the required level', () => {
    // junior=0, mid=1, senior=2, lead=3, principal=4 rung indices.
    // Candidate at "mid" (index 1) against a "senior" requirement (index 2).
    expect(senioritySubscore({ level: 'senior' }, 3)).toBe(0.5);
  });
});

describe('bestDegreeLevel', () => {
  it('returns the highest degree level present', () => {
    const attrs: readonly ExtractedAttribute[] = [education('bachelor'), education('master')];
    expect(bestDegreeLevel(attrs)).toBe('master');
  });

  it('returns null when no education attribute is present', () => {
    expect(bestDegreeLevel([skill('postgresql')])).toBeNull();
  });
});

describe('hasCertification', () => {
  it('detects a matching certification by canonical id', () => {
    expect(hasCertification('pmp', [cert('pmp')])).toBe(true);
    expect(hasCertification('pmp', [cert('cissp')])).toBe(false);
  });
});

describe('educationCertsSubscore', () => {
  it('is 1.0 when the candidate meets the required degree level and no certs are required', () => {
    const attrs: readonly ExtractedAttribute[] = [education('bachelor')];
    expect(educationCertsSubscore({ minDegreeLevel: 'bachelor' }, attrs)).toBe(1);
  });

  it('is proportional when the candidate falls short of the required degree level', () => {
    const attrs: readonly ExtractedAttribute[] = [education('high_school')];
    // high_school=0, associate=1, bachelor=2 rung indices out of ladder length 6.
    const score = educationCertsSubscore({ minDegreeLevel: 'bachelor' }, attrs);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(1);
  });

  it('is 0 when no education attribute exists at all and a degree is required', () => {
    expect(educationCertsSubscore({ minDegreeLevel: 'bachelor' }, [])).toBe(0);
  });

  it('factors in required certifications when specified', () => {
    const metCerts: readonly ExtractedAttribute[] = [education('bachelor'), cert('pmp')];
    const unmetCerts: readonly ExtractedAttribute[] = [education('bachelor')];
    const reqWithCert = { minDegreeLevel: 'bachelor' as const, requiredCertifications: ['pmp'] };
    expect(educationCertsSubscore(reqWithCert, metCerts)).toBe(1);
    expect(educationCertsSubscore(reqWithCert, unmetCerts)).toBeLessThan(1);
  });
});
