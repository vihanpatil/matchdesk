import { describe, expect, it } from 'vitest';

import * as core from './index.js';

/**
 * The public surface of `packages/core`, asserted through the barrel rather
 * than through deep module paths.
 *
 * Coverage deliberately does NOT exempt barrel files: an earlier config
 * excluded `**\/index.ts` by glob, which would have let real logic live in any
 * index file completely unmeasured. Exercising the barrel here keeps the
 * exemption unnecessary.
 */
describe('@matchdesk/core public API', () => {
  it('exports exactly the intended surface', () => {
    const exported = Object.keys(core).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(exported).toEqual([
      'ALIAS_SUBSCORE',
      'DEGREE_LADDER',
      'DIMENSION_IDS',
      'EXACT_SUBSCORE',
      'NONE_SUBSCORE',
      'RELATED_SUBSCORE',
      'SENIORITY_LADDER',
      'SENIORITY_YEAR_THRESHOLDS',
      'TAXONOMY',
      'aliasesOf',
      'assertValidSpan',
      'bestDegreeLevel',
      'buildExplanation',
      'canonicalize',
      'detectSections',
      'educationCertsSubscore',
      'evaluateEligibility',
      'experienceRelevanceSubscore',
      'extractAttributes',
      'extractCertifications',
      'extractEducation',
      'extractSkills',
      'extractYearsExperience',
      'getEntry',
      'hasCertification',
      'inferSeniorityLevel',
      'matchAllSkillRequirements',
      'matchSkillRequirement',
      'quantize',
      'rankCandidates',
      'relatedTo',
      'roundHalfUp',
      'scoreCandidate',
      'segmentLines',
      'senioritySubscore',
      'skillsSubscore',
      'totalYearsExperience',
    ]);
  });

  it('re-exports working numeric implementations, not just names', () => {
    expect(core.roundHalfUp(2.5)).toBe(3);
    expect(core.quantize(0.1234564999)).toBe(0.123456);
  });

  it('re-exports a working taxonomy, not just names', () => {
    expect(core.canonicalize('Postgres')).toBe('postgresql');
    expect(core.relatedTo('postgresql')).toEqual(['sql']);
  });

  it('re-exports a working end-to-end pipeline: extract from text, then score against a job', () => {
    const text = 'Skills: PostgreSQL, React. 5+ years of experience. PMP certified.';
    const attributes = core.extractAttributes(text, { referenceDate: { year: 2026, month: 1 } });
    expect(attributes.length).toBeGreaterThan(0);

    const job: core.Job = {
      id: 'j1',
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'postgresql', label: 'PostgreSQL', mustHave: true },
        ],
      },
    };
    const candidate: core.Candidate = {
      id: 'c1',
      createdAt: '2026-01-01T00:00:00.000Z',
      attributes,
    };
    const result = core.scoreCandidate(job, candidate);
    expect(result.eligibility.eligible).toBe(true);
    expect(result.score).toBe(100);
  });
});
