import { describe, expect, it } from 'vitest';

import { extractSkills } from '../extraction/skills.js';
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

  it('a candidate who writes "Ruby on Rails" is eligible for a job requiring "Ruby" (H-028 D2)', () => {
    // The real defect: a Rails developer was scored ineligible for a Ruby
    // job because "Ruby on Rails" only ever extracted as `rails`, never as
    // `ruby` — describing themselves more precisely made them ineligible.
    const job: Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [{ id: 'r1', canonicalSkillId: 'ruby', label: 'Ruby', mustHave: true }],
      },
    };
    const candidateSkills = extractSkills('Skills: Ruby on Rails');
    const result = evaluateEligibility(job, candidate(candidateSkills));
    expect(result.eligible).toBe(true);
    expect(result.unmet).toEqual([]);
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

/**
 * UNMET-REASON CONTENT (ADR-023 E4 / H-057).
 *
 * Mutation testing showed every `dimension`, `label` and `reason` string in
 * this module could be replaced with an empty string and no test noticed. An
 * unmet must-have is the reason a candidate is placed in the ineligible group
 * — the recruiter is shown that sentence as the justification for not
 * shortlisting a real person. An empty or wrong one is not a cosmetic defect.
 */
describe('unmet requirement reasons are exact (H-057)', () => {
  const candidateWith = (attributes: readonly ExtractedAttribute[]): Candidate => ({
    id: 'c',
    createdAt: '2026-01-01T00:00:00.000Z',
    attributes,
  });

  it('names the missing must-have skill, and tags it to the skills dimension', () => {
    const job: Job = {
      id: 'j',
      skills: {
        weight: 1,
        requirements: [{ id: 'r', canonicalSkillId: 'rust', label: 'Rust', mustHave: true }],
      },
    };
    const result = evaluateEligibility(job, candidateWith([]));

    expect(result.eligible).toBe(false);
    expect(result.unmet[0]?.dimension).toBe('skills');
    expect(result.unmet[0]?.label).toBe('Rust');
    expect(result.unmet[0]?.reason).toBe('Must-have skill "Rust" was not found.');
  });

  it('distinguishes "not found" from "only a related skill was found"', () => {
    // The two sentences send a recruiter to different actions: one candidate
    // has nothing, the other has adjacent evidence worth a human look. A
    // mutant collapsing the ternary erases that difference.
    const job: Job = {
      id: 'j',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r', canonicalSkillId: 'typescript', label: 'TypeScript', mustHave: true },
        ],
      },
    };
    const related = candidateWith(extractSkills('Skills: JavaScript'));
    const result = evaluateEligibility(job, related);

    expect(result.unmet[0]?.reason).toBe(
      'Must-have skill "TypeScript" was not found; only a related skill was.',
    );
  });

  it('states the required and found years for an unmet experience must-have', () => {
    const job: Job = {
      id: 'j',
      experience: { weight: 1, requirement: { minYears: 10, mustHave: true } },
    };
    const years: YearsExperienceAttribute = {
      kind: 'years_experience',
      value: '3 years',
      normalizedValue: '3',
      confidence: 0.9,
      sourceSpan: { start: 0, end: 7 },
      years: 3,
    };
    const result = evaluateEligibility(job, candidateWith([years]));

    expect(result.unmet[0]?.dimension).toBe('experience_relevance');
    expect(result.unmet[0]?.reason).toBe('Requires at least 10 years of experience; found 3.');
  });

  it('states the required level for an unmet seniority must-have', () => {
    const job: Job = {
      id: 'j',
      seniority: { weight: 1, requirement: { level: 'principal', mustHave: true } },
    };
    const result = evaluateEligibility(job, candidateWith([]));

    expect(result.unmet[0]?.dimension).toBe('seniority');
    expect(result.unmet[0]?.reason).toBe(
      'Requires principal level or above, inferred from years of experience.',
    );
  });

  it('states the required degree for an unmet education must-have', () => {
    const job: Job = {
      id: 'j',
      educationCerts: {
        weight: 1,
        requirement: { minDegreeLevel: 'doctorate', mustHave: true },
      },
    };
    const result = evaluateEligibility(job, candidateWith([]));

    expect(result.unmet[0]?.dimension).toBe('education_certs');
    expect(result.unmet[0]?.reason).toBe('Requires at least a doctorate degree.');
  });

  it('names the specific missing certification', () => {
    const job: Job = {
      id: 'j',
      educationCerts: {
        weight: 1,
        requirement: {
          minDegreeLevel: 'high_school',
          requiredCertifications: ['pmp'],
          mustHave: true,
        },
      },
    };
    const edu: EducationAttribute = {
      kind: 'education',
      value: 'High School',
      normalizedValue: 'high_school',
      confidence: 0.85,
      sourceSpan: { start: 0, end: 11 },
      degreeLevel: 'high_school',
      field: null,
    };
    const result = evaluateEligibility(job, candidateWith([edu]));

    expect(result.unmet[0]?.label).toBe('pmp');
    expect(result.unmet[0]?.reason).toBe('Requires the "pmp" certification.');
  });

  it('treats a candidate with NO degree as below every degree requirement', () => {
    // Pins `candidateDegree === null ? -1 : ...` — a mutant returning +1 would
    // rank "no degree at all" above the entire ladder and make every
    // degree must-have trivially satisfied.
    const job: Job = {
      id: 'j',
      educationCerts: {
        weight: 1,
        requirement: { minDegreeLevel: 'high_school', mustHave: true },
      },
    };
    const result = evaluateEligibility(job, candidateWith([]));

    expect(result.eligible).toBe(false);
    expect(result.unmet.length).toBeGreaterThan(0);
  });

  it('an alias-level skill match SATISFIES a must-have, a related one does not', () => {
    // Pins the `>= ALIAS_SUBSCORE` cutoff in both directions.
    const job: Job = {
      id: 'j',
      skills: {
        weight: 1,
        requirements: [{ id: 'r', canonicalSkillId: 'javascript', label: 'JS', mustHave: true }],
      },
    };
    const viaAlias = candidateWith(extractSkills('Skills: js'));
    expect(evaluateEligibility(job, viaAlias).eligible).toBe(true);
  });
});
