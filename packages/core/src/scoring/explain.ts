import type { SourceSpan } from '../extraction/types.js';
import { quantize, roundHalfUp } from '../numeric/round.js';
import type { SkillRequirementMatch } from './dimensions.js';
import type {
  Candidate,
  DimensionContribution,
  DimensionId,
  EligibilityResult,
  Explanation,
  GapItem,
  Job,
  StrengthItem,
} from './types.js';

function dimensionOf(
  dimensions: readonly DimensionContribution[],
  id: DimensionId,
): DimensionContribution | null {
  return dimensions.find((d) => d.dimension === id) ?? null;
}

/** Non-skill dimension ids — the only ones `representativeSpan`/`dimensionLabel` are ever called with. */
type NonSkillDimensionId = Exclude<DimensionId, 'skills'>;

/** Evidence span for a non-skill dimension: the first supporting attribute of the relevant kind. */
function representativeSpan(
  candidate: Candidate,
  dimension: NonSkillDimensionId,
): SourceSpan | null {
  if (dimension === 'experience_relevance' || dimension === 'seniority') {
    const attr = candidate.attributes.find((a) => a.kind === 'years_experience');
    return attr?.sourceSpan ?? null;
  }
  const edu = candidate.attributes.find((a) => a.kind === 'education');
  if (edu) return edu.sourceSpan;
  const cert = candidate.attributes.find((a) => a.kind === 'certification');
  return cert?.sourceSpan ?? null;
}

function skillStrengths(
  skillMatches: readonly SkillRequirementMatch[],
  skillsDim: DimensionContribution | null,
): readonly StrengthItem[] {
  const preferred = skillMatches.filter((m) => !m.requirement.mustHave);
  const perReqWeight =
    skillsDim !== null && preferred.length > 0 ? skillsDim.weight / preferred.length : 0;

  const items: StrengthItem[] = [];
  for (const m of preferred) {
    if (m.match.subscore <= 0) continue;
    items.push({
      dimension: 'skills',
      label: m.requirement.label,
      matchType: m.match.matchType,
      contribution: quantize(perReqWeight * m.match.subscore),
      evidence: m.match.evidence,
    });
  }
  for (const m of skillMatches) {
    if (!m.requirement.mustHave) continue;
    if (m.match.subscore <= 0) continue;
    // Met must-haves contribute 0 to the score (ADR-007) but are still
    // valuable evidence for why the candidate is eligible.
    items.push({
      dimension: 'skills',
      label: m.requirement.label,
      matchType: m.match.matchType,
      contribution: 0,
      evidence: m.match.evidence,
    });
  }
  return items;
}

function skillPreferredGaps(skillMatches: readonly SkillRequirementMatch[]): readonly GapItem[] {
  return skillMatches
    .filter((m) => !m.requirement.mustHave && m.match.matchType === 'none')
    .map((m) => ({
      dimension: 'skills' as const,
      label: m.requirement.label,
      reason: `No evidence of "${m.requirement.label}" was found.`,
    }));
}

function otherDimensionStrengthsAndGaps(
  job: Job,
  candidate: Candidate,
  dimensions: readonly DimensionContribution[],
): { strengths: readonly StrengthItem[]; gaps: readonly GapItem[] } {
  const strengths: StrengthItem[] = [];
  const gaps: GapItem[] = [];

  for (const dim of dimensions) {
    if (dim.dimension === 'skills') continue;
    const evidence = representativeSpan(candidate, dim.dimension);

    if (dim.subscore > 0) {
      strengths.push({
        dimension: dim.dimension,
        label: dimensionLabel(dim.dimension),
        matchType: 'meets_requirement',
        contribution: dim.contribution,
        evidence,
      });
    }
    if (dim.subscore < 1) {
      gaps.push({
        dimension: dim.dimension,
        label: dimensionLabel(dim.dimension),
        reason: shortfallReason(job, dim),
      });
    }
  }

  return { strengths, gaps };
}

function dimensionLabel(dimension: NonSkillDimensionId): string {
  switch (dimension) {
    case 'experience_relevance':
      return 'Experience';
    case 'seniority':
      return 'Seniority';
    case 'education_certs':
      return 'Education & Certifications';
  }
}

function shortfallReason(job: Job, dim: DimensionContribution): string {
  const percent = roundHalfUp(dim.subscore * 100, 0);
  if (dim.dimension === 'experience_relevance' && job.experience !== undefined) {
    return `Requires ${String(job.experience.requirement.minYears)}+ years of experience (${String(percent)}% met).`;
  }
  if (dim.dimension === 'seniority' && job.seniority !== undefined) {
    return `Requires ${job.seniority.requirement.level} level (${String(percent)}% met).`;
  }
  if (dim.dimension === 'education_certs' && job.educationCerts !== undefined) {
    return `Requires at least a ${job.educationCerts.requirement.minDegreeLevel} degree (${String(percent)}% met).`;
  }
  return `${String(percent)}% met.`;
}

function caveatsFor(job: Job, dimensions: readonly DimensionContribution[]): readonly string[] {
  const caveats: string[] = [];
  if (dimensionOf(dimensions, 'skills') !== null && job.skills !== undefined) {
    caveats.push(
      'Semantic/embedding matching (cascade step 4) is not implemented in this slice; unmatched skill requirements are recorded as gaps rather than scored via similarity.',
    );
  }
  if (dimensionOf(dimensions, 'experience_relevance') !== null) {
    caveats.push(
      'experience_relevance is a rule-based proxy: it measures cumulative years found in explicit statements and parsed employment date ranges. It does not assess whether that time was spent on work relevant to this role, and can double-count concurrent roles.',
    );
  }
  if (dimensionOf(dimensions, 'seniority') !== null) {
    caveats.push(
      'seniority is inferred solely from total years of experience against fixed thresholds; no job-title signal is used in this slice.',
    );
  }
  return caveats;
}

/**
 * Builds the Section 6.7 explanation object: strengths ranked by
 * weight x subscore contribution (each with match type and evidence span),
 * gaps split must-have vs preferred, a score composition where dimension
 * contributions visibly sum to the total, and honest caveats.
 */
export function buildExplanation(params: {
  readonly job: Job;
  readonly candidate: Candidate;
  readonly dimensions: readonly DimensionContribution[];
  readonly skillMatches: readonly SkillRequirementMatch[];
  readonly eligibility: EligibilityResult;
}): Explanation {
  const { job, candidate, dimensions, skillMatches, eligibility } = params;
  const skillsDim = dimensionOf(dimensions, 'skills');
  const other = otherDimensionStrengthsAndGaps(job, candidate, dimensions);

  const strengths = [...skillStrengths(skillMatches, skillsDim), ...other.strengths]
    .slice()
    .sort(
      (a, b) =>
        b.contribution - a.contribution ||
        (a.dimension < b.dimension ? -1 : a.dimension > b.dimension ? 1 : 0) ||
        (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
    );

  const preferredGaps = [...skillPreferredGaps(skillMatches), ...other.gaps];

  const mustHaveGaps: readonly GapItem[] = eligibility.unmet.map((u) => ({
    dimension: u.dimension,
    label: u.label,
    reason: u.reason,
  }));

  const compositionTotal = quantize(dimensions.reduce((acc, d) => acc + d.contribution, 0));

  return {
    strengths,
    gaps: { mustHave: mustHaveGaps, preferred: preferredGaps },
    composition: { dimensions, total: compositionTotal },
    caveats: caveatsFor(job, dimensions),
  };
}
