import { DEGREE_LADDER } from './types.js';
import type { SourceSpan } from '../extraction/types.js';
import { quantize, roundHalfUp } from '../numeric/round.js';
import { bestDegreeLevel, type SkillRequirementMatch } from './dimensions.js';
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

/**
 * The EARLIEST supporting attribute of a kind, by source span.
 *
 * Deliberately not "the first one in the array" (H-028 D8, closed by H-066).
 * That is what this did, and measured, reversing a candidate's attribute array
 * moved the reported tenure evidence from "10 years of experience" (span
 * 21..43) to "Jan 2016 - Jan 2026" (span 98..133) while the score stayed
 * identical at 100. Both spans are genuine evidence, so nothing was
 * fabricated — but which one a recruiter is shown depended on array order,
 * and array order is not a contract anyone had stated.
 *
 * Earliest-span is the tie-break `cascade.ts` already uses for skills, so this
 * makes the two halves of the explanation agree instead of one being ordered
 * and the other incidental.
 *
 * **This was latent, not live.** Since ADR-024 attributes are always re-derived
 * by `extractAttributes`, whose order is deterministic (verified over repeated
 * runs), so no current path shuffles them. It is fixed anyway: the defence was
 * "nothing reorders them yet", and the array is public API.
 */
function earliestOfKind(
  candidate: Candidate,
  kind: 'years_experience' | 'education' | 'certification',
): SourceSpan | null {
  let earliest: SourceSpan | null = null;
  for (const attribute of candidate.attributes) {
    if (attribute.kind !== kind) continue;
    if (earliest === null || attribute.sourceSpan.start < earliest.start) {
      earliest = attribute.sourceSpan;
    }
  }
  return earliest;
}

/** Evidence span for a non-skill dimension. */
function representativeSpan(
  candidate: Candidate,
  dimension: NonSkillDimensionId,
): SourceSpan | null {
  if (dimension === 'experience_relevance' || dimension === 'seniority') {
    return earliestOfKind(candidate, 'years_experience');
  }
  return earliestOfKind(candidate, 'education') ?? earliestOfKind(candidate, 'certification');
}

/**
 * ADR-017: every skill requirement — must-have or preferred — is weighted
 * equally within the dimension (matching `skillsSubscore`'s plain average),
 * so a met must-have shows its real contribution here rather than a
 * hardcoded 0. It remains true, separately, that must-haves are also the
 * eligibility predicate (`./eligibility.js`) — that is additive, not this
 * function's concern.
 */
function skillStrengths(
  skillMatches: readonly SkillRequirementMatch[],
  skillsDim: DimensionContribution | null,
): readonly StrengthItem[] {
  const perReqWeight =
    skillsDim !== null && skillMatches.length > 0 ? skillsDim.weight / skillMatches.length : 0;

  const items: StrengthItem[] = [];
  for (const m of skillMatches) {
    if (m.match.subscore <= 0) continue;
    items.push({
      dimension: 'skills',
      label: m.requirement.label,
      matchType: m.match.matchType,
      contribution: quantize(perReqWeight * m.match.subscore),
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

    // `meets_requirement` is a CLAIM, and it must only be made when the
    // requirement is actually met (H-054). The previous condition was
    // `subscore > 0`, so any partially-met dimension was emitted as BOTH a
    // strength asserting "meets_requirement" AND a gap describing the
    // shortfall — the same label, contradicting itself, in the text a
    // recruiter reads to justify a decision to a candidate. A partial
    // subscore still reaches the score through `composition`; what is
    // withdrawn here is only the false claim.
    if (dim.subscore >= 1) {
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
        reason: shortfallReason(job, candidate, dim),
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

/**
 * Explains WHICH part of a dimension fell short.
 *
 * The education/certifications dimension averages a degree subscore and a
 * certification subscore, so a candidate who holds the required degree but
 * lacks a required certification scores 0.5 on it. The reason text used to
 * report that as `Requires at least a high_school degree (50% met)` — naming
 * the degree, which was FULLY met, as the shortfall (H-054). A recruiter
 * reading that would conclude the candidate's education was deficient when
 * the actual gap was a certification, already listed separately.
 */
function shortfallReason(job: Job, candidate: Candidate, dim: DimensionContribution): string {
  const percent = roundHalfUp(dim.subscore * 100, 0);
  if (dim.dimension === 'experience_relevance' && job.experience !== undefined) {
    return `Requires ${String(job.experience.requirement.minYears)}+ years of experience (${String(percent)}% met).`;
  }
  if (dim.dimension === 'seniority' && job.seniority !== undefined) {
    return `Requires ${job.seniority.requirement.level} level (${String(percent)}% met).`;
  }
  if (dim.dimension === 'education_certs' && job.educationCerts !== undefined) {
    const required = job.educationCerts.requirement.minDegreeLevel;
    const held = bestDegreeLevel(candidate.attributes);
    const degreeMet =
      held !== null && DEGREE_LADDER.indexOf(held) >= DEGREE_LADDER.indexOf(required);

    if (degreeMet) {
      return `Holds the required degree; a required certification is missing (${String(percent)}% met).`;
    }
    return `Requires at least a ${required} degree (${String(percent)}% met).`;
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
