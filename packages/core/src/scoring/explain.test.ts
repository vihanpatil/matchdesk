import { describe, expect, it } from 'vitest';

import type {
  CertificationAttribute,
  EducationAttribute,
  ExtractedAttribute,
  SkillAttribute,
  SourceSpan,
  YearsExperienceAttribute,
} from '../extraction/types.js';
import { matchAllSkillRequirements } from './dimensions.js';
import { buildExplanation } from './explain.js';
import { scoreCandidate } from './score.js';
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

/**
 * CONTENT tests for the recruiter-facing explanation (H-036, ADR-023 E4).
 *
 * Mutation testing scored this module at 33.97% with 138 surviving mutants —
 * the worst in the package, in the one file whose output a recruiter reads to
 * justify a shortlisting decision to a hiring manager or to a candidate. The
 * existing tests asserted that an explanation was PRODUCED; almost nothing
 * asserted what it SAYS.
 *
 * These pin the content: which evidence span attaches to which dimension,
 * what each label and reason string is, how strengths are ordered, which gaps
 * land in which bucket, and what caveats are disclosed. A mutant that silently
 * rewires any of those changes what a person is told about their own CV.
 */
describe('explanation CONTENT (H-036)', () => {
  const span = (start: number, end: number): SourceSpan => ({ start, end });

  const yearsAttr = (years: number, start = 10): YearsExperienceAttribute => ({
    kind: 'years_experience',
    value: `${String(years)} years`,
    normalizedValue: String(years),
    confidence: 0.9,
    sourceSpan: span(start, start + 7),
    years,
  });

  const eduAttr = (start = 50): EducationAttribute => ({
    kind: 'education',
    value: 'BSc',
    normalizedValue: 'bachelor',
    confidence: 0.85,
    sourceSpan: span(start, start + 3),
    degreeLevel: 'bachelor',
    field: null,
  });

  const certAttr = (start = 80): CertificationAttribute => ({
    kind: 'certification',
    value: 'PMP',
    normalizedValue: 'pmp',
    confidence: 0.9,
    sourceSpan: span(start, start + 3),
    canonicalId: 'pmp',
  });

  const candidateWith = (attributes: readonly ExtractedAttribute[]): Candidate => ({
    id: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    attributes,
  });

  // ---- evidence routing: which attribute backs which dimension ------------

  it('routes the EXPERIENCE evidence span to the years_experience attribute', () => {
    const job: Job = { id: 'j', experience: { weight: 1, requirement: { minYears: 2 } } };
    const result = scoreCandidate(job, candidateWith([yearsAttr(10, 42)]));
    const strength = result.explanation.strengths.find(
      (s) => s.dimension === 'experience_relevance',
    );

    expect(strength?.evidence).toEqual(span(42, 49));
  });

  it('routes the SENIORITY evidence span to the years_experience attribute, not education', () => {
    // A mutant that swaps which attribute kind backs a dimension would show
    // the recruiter a highlighted degree as the proof of seniority.
    const job: Job = { id: 'j', seniority: { weight: 1, requirement: { level: 'junior' } } };
    const result = scoreCandidate(job, candidateWith([eduAttr(50), yearsAttr(10, 42)]));
    const strength = result.explanation.strengths.find((s) => s.dimension === 'seniority');

    expect(strength?.evidence).toEqual(span(42, 49));
  });

  it('routes the EDUCATION evidence span to the education attribute when one exists', () => {
    const job: Job = {
      id: 'j',
      educationCerts: { weight: 1, requirement: { minDegreeLevel: 'bachelor' } },
    };
    const result = scoreCandidate(job, candidateWith([yearsAttr(10, 42), eduAttr(55)]));
    const strength = result.explanation.strengths.find((s) => s.dimension === 'education_certs');

    expect(strength?.evidence).toEqual(span(55, 58));
  });

  it('falls back to a CERTIFICATION span for the education dimension when no degree exists', () => {
    const job: Job = {
      id: 'j',
      educationCerts: {
        weight: 1,
        requirement: { minDegreeLevel: 'high_school', requiredCertifications: ['pmp'] },
      },
    };
    const result = scoreCandidate(job, candidateWith([certAttr(88)]));
    const gapOrStrength = [
      ...result.explanation.strengths,
      ...result.explanation.gaps.preferred,
    ].find((i) => i.dimension === 'education_certs');

    expect(gapOrStrength).toBeDefined();
    const strength = result.explanation.strengths.find((s) => s.dimension === 'education_certs');
    if (strength !== undefined) expect(strength.evidence).toEqual(span(88, 91));
  });

  it('reports a NULL evidence span when the candidate has no supporting attribute at all', () => {
    const job: Job = { id: 'j', experience: { weight: 1, requirement: { minYears: 0 } } };
    const result = scoreCandidate(job, candidateWith([]));
    const strength = result.explanation.strengths.find(
      (s) => s.dimension === 'experience_relevance',
    );

    expect(strength?.evidence).toBeNull();
  });

  // ---- labels -------------------------------------------------------------

  it('labels each non-skill dimension exactly, since the label is what the recruiter reads', () => {
    const job: Job = {
      id: 'j',
      experience: { weight: 1, requirement: { minYears: 0 } },
      seniority: { weight: 1, requirement: { level: 'junior' } },
      educationCerts: { weight: 1, requirement: { minDegreeLevel: 'high_school' } },
    };
    const result = scoreCandidate(job, candidateWith([yearsAttr(10), eduAttr()]));
    const labels = new Map(result.explanation.strengths.map((s) => [s.dimension, s.label]));

    expect(labels.get('experience_relevance')).toBe('Experience');
    expect(labels.get('seniority')).toBe('Seniority');
    expect(labels.get('education_certs')).toBe('Education & Certifications');
  });

  it('labels a skill strength with the REQUIREMENT label, not the candidate attribute', () => {
    const job: Job = {
      id: 'j',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'python', label: 'Python 3', mustHave: false },
        ],
      },
    };
    const result = scoreCandidate(
      job,
      candidateWith([
        {
          kind: 'skill',
          value: 'python',
          normalizedValue: 'python',
          confidence: 0.95,
          sourceSpan: span(0, 6),
          canonicalId: 'python',
          matchType: 'exact',
        },
      ]),
    );

    expect(result.explanation.strengths[0]?.label).toBe('Python 3');
  });

  // ---- shortfall reasons --------------------------------------------------

  it('states the experience shortfall with the required years and the percent met', () => {
    const job: Job = { id: 'j', experience: { weight: 1, requirement: { minYears: 10 } } };
    const result = scoreCandidate(job, candidateWith([yearsAttr(5)]));
    const gap = result.explanation.gaps.preferred.find(
      (g) => g.dimension === 'experience_relevance',
    );

    expect(gap?.reason).toBe('Requires 10+ years of experience (50% met).');
  });

  it('states the seniority shortfall with the required level', () => {
    const job: Job = { id: 'j', seniority: { weight: 1, requirement: { level: 'principal' } } };
    const result = scoreCandidate(job, candidateWith([yearsAttr(0)]));
    const gap = result.explanation.gaps.preferred.find((g) => g.dimension === 'seniority');

    expect(gap?.reason).toMatch(/^Requires principal level \(\d+% met\)\.$/);
  });

  it('blames the DEGREE only when the degree bar is actually missed (H-054)', () => {
    const job: Job = {
      id: 'j',
      educationCerts: { weight: 1, requirement: { minDegreeLevel: 'doctorate' } },
    };
    const result = scoreCandidate(job, candidateWith([eduAttr()]));
    const gap = result.explanation.gaps.preferred.find((g) => g.dimension === 'education_certs');

    expect(gap?.reason).toMatch(/Requires at least a doctorate degree/);
  });

  it('blames the CERTIFICATION when the degree is held but a certification is missing (H-054)', () => {
    const job: Job = {
      id: 'j',
      educationCerts: {
        weight: 1,
        requirement: { minDegreeLevel: 'bachelor', requiredCertifications: ['pmp'] },
      },
    };
    const result = scoreCandidate(job, candidateWith([eduAttr()]));
    const gap = result.explanation.gaps.preferred.find((g) => g.dimension === 'education_certs');

    expect(gap?.reason).toBe(
      'Holds the required degree; a required certification is missing (50% met).',
    );
  });

  it('names the missing skill in a preferred skill gap', () => {
    const job: Job = {
      id: 'j',
      skills: {
        weight: 1,
        requirements: [{ id: 'r1', canonicalSkillId: 'rust', label: 'Rust', mustHave: false }],
      },
    };
    const result = scoreCandidate(job, candidateWith([]));

    expect(result.explanation.gaps.preferred[0]?.reason).toBe('No evidence of "Rust" was found.');
  });

  // ---- gap bucketing ------------------------------------------------------

  it('puts an unmet MUST-HAVE in the mustHave bucket and never in preferred', () => {
    const job: Job = {
      id: 'j',
      skills: {
        weight: 1,
        requirements: [{ id: 'r1', canonicalSkillId: 'rust', label: 'Rust', mustHave: true }],
      },
    };
    const result = scoreCandidate(job, candidateWith([]));

    expect(result.explanation.gaps.mustHave.map((g) => g.label)).toContain('Rust');
    expect(result.explanation.gaps.preferred.map((g) => g.label)).not.toContain('Rust');
  });

  // ---- ordering -----------------------------------------------------------

  it('ranks strengths by contribution, descending', () => {
    const job: Job = {
      id: 'j',
      skills: {
        weight: 10,
        requirements: [
          { id: 'r1', canonicalSkillId: 'python', label: 'Python', mustHave: false },
          { id: 'r2', canonicalSkillId: 'sql', label: 'SQL', mustHave: false },
        ],
      },
      experience: { weight: 1, requirement: { minYears: 1 } },
    };
    const result = scoreCandidate(
      job,
      candidateWith([
        {
          kind: 'skill',
          value: 'python',
          normalizedValue: 'python',
          confidence: 0.95,
          sourceSpan: span(0, 6),
          canonicalId: 'python',
          matchType: 'exact',
        },
        yearsAttr(20),
      ]),
    );

    const contributions = result.explanation.strengths.map((s) => s.contribution);
    expect(contributions).toEqual([...contributions].sort((a, b) => b - a));
  });

  // ---- caveats ------------------------------------------------------------

  it('discloses the embedding caveat whenever a skills dimension is active', () => {
    const job: Job = { id: 'j', skills: { weight: 1, requirements: [] } };
    const result = scoreCandidate(job, candidateWith([]));

    expect(result.explanation.caveats.join(' ')).toMatch(/Semantic\/embedding matching/);
  });

  it('discloses the experience proxy caveat, including that it can double-count', () => {
    const job: Job = { id: 'j', experience: { weight: 1, requirement: { minYears: 1 } } };
    const result = scoreCandidate(job, candidateWith([yearsAttr(3)]));

    expect(result.explanation.caveats.join(' ')).toMatch(/rule-based proxy/);
    expect(result.explanation.caveats.join(' ')).toMatch(/concurrent roles/);
  });

  it('discloses that seniority is inferred only from years, with no job-title signal', () => {
    const job: Job = { id: 'j', seniority: { weight: 1, requirement: { level: 'senior' } } };
    const result = scoreCandidate(job, candidateWith([yearsAttr(6)]));

    expect(result.explanation.caveats.join(' ')).toMatch(/no job-title signal/);
  });

  it('discloses NO caveat for a dimension that is not active', () => {
    // A caveat for a dimension the job never asked about is noise that erodes
    // trust in the ones that matter.
    const job: Job = { id: 'j', skills: { weight: 1, requirements: [] } };
    const result = scoreCandidate(job, candidateWith([]));

    expect(result.explanation.caveats.join(' ')).not.toMatch(/seniority is inferred/);
    expect(result.explanation.caveats.join(' ')).not.toMatch(/rule-based proxy/);
  });

  // ---- composition --------------------------------------------------------

  it('reports a composition whose dimensions are the SAME list the score used', () => {
    const job: Job = {
      id: 'j',
      experience: { weight: 2, requirement: { minYears: 1 } },
      seniority: { weight: 1, requirement: { level: 'junior' } },
    };
    const result = scoreCandidate(job, candidateWith([yearsAttr(4)]));

    expect(result.explanation.composition.dimensions).toEqual(result.dimensions);
  });

  it('reports a composition total equal to the sum of contributions', () => {
    const job: Job = {
      id: 'j',
      experience: { weight: 2, requirement: { minYears: 1 } },
      seniority: { weight: 1, requirement: { level: 'junior' } },
    };
    const result = scoreCandidate(job, candidateWith([yearsAttr(4)]));
    const sum = result.explanation.composition.dimensions.reduce(
      (acc, d) => acc + d.contribution,
      0,
    );

    expect(Math.abs(result.explanation.composition.total - sum)).toBeLessThan(1e-6);
  });
});
