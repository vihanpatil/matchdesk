import type {
  CertificationAttribute,
  DegreeLevel,
  ExtractedAttribute,
  SkillAttribute,
} from '../extraction/types.js';
import { quantize } from '../numeric/round.js';
import type { SemanticMatcher, SkillMatchResult } from './cascade.js';
import { matchSkillRequirement } from './cascade.js';
import {
  DEGREE_LADDER,
  SENIORITY_LADDER,
  type EducationRequirement,
  type ExperienceRequirement,
  type SeniorityLevel,
  type SeniorityRequirement,
  type SkillRequirement,
  type SkillsDimensionSpec,
} from './types.js';

// -------------------------------------------------------------------------
// skills
// -------------------------------------------------------------------------

export interface SkillRequirementMatch {
  readonly requirement: SkillRequirement;
  readonly match: SkillMatchResult;
}

/** Runs the cascade for every requirement in a job's skills dimension. */
export function matchAllSkillRequirements(
  spec: SkillsDimensionSpec,
  candidateSkills: readonly SkillAttribute[],
  semanticMatcher?: SemanticMatcher,
): readonly SkillRequirementMatch[] {
  return spec.requirements.map((requirement) => ({
    requirement,
    match: matchSkillRequirement(requirement.canonicalSkillId, candidateSkills, semanticMatcher),
  }));
}

/**
 * Skills dimension subscore. ADR-017 (amending ADR-007) is binding: a
 * must-have requirement contributes to this average exactly like a
 * preferred one — every requirement in the dimension is weighted equally.
 * Must-haves are ALSO evaluated separately as the eligibility predicate
 * (see `./eligibility.js`), which is what partitions eligible from
 * ineligible; that partition is structural and does not depend on this
 * average. When there are no requirements at all, the dimension is
 * neutrally 1.0 for every candidate under this job — a constant, so it
 * cannot violate monotonicity.
 */
export function skillsSubscore(matches: readonly SkillRequirementMatch[]): number {
  if (matches.length === 0) return 1;
  const sum = matches.reduce((acc, m) => acc + m.match.subscore, 0);
  return quantize(sum / matches.length);
}

// -------------------------------------------------------------------------
// experience_relevance
//
// HONEST CAVEAT: this is a rule-based proxy. It measures the cumulative
// number of years found across explicit "X years of experience" statements
// and parsed employment date ranges ANYWHERE in the candidate's attributes.
// It does NOT assess whether that time was spent on relevant work, does not
// weight it by which skills it overlapped with, and can double-count
// concurrent roles. See docs caveats surfaced through `./explain.ts`.
// -------------------------------------------------------------------------

/**
 * H-028 D5b: an explicit "N years of experience" statement and the
 * employment date ranges it describes must not both be added to the total —
 * that roughly doubles the candidate's apparent tenure. Computed tenure from
 * date ranges wins when any is present (date ranges are independently
 * verifiable evidence spans; overlap between ranges is already merged by
 * `extractYearsExperience`), and explicit statements are treated as
 * corroboration rather than an addend. When no date range is present at
 * all, the explicit statement is the only signal, so it is used directly —
 * and if more than one such statement exists, the MAX is used (not the
 * sum), since multiple statements are read as restating the same fact
 * ("10 years of experience" in the summary and again in a cover paragraph),
 * not as additive claims.
 */
export function totalYearsExperience(attributes: readonly ExtractedAttribute[]): number {
  const yearsAttrs = attributes.filter(
    (a): a is Extract<ExtractedAttribute, { kind: 'years_experience' }> =>
      a.kind === 'years_experience',
  );
  const rangeYears = yearsAttrs.filter((a) => a.isExplicitStatement !== true);
  const rangeTotal = rangeYears.reduce((acc, a) => acc + a.years, 0);
  if (rangeTotal > 0) return quantize(rangeTotal);

  const explicitYears = yearsAttrs.filter((a) => a.isExplicitStatement === true);
  const explicitMax = explicitYears.reduce((acc, a) => Math.max(acc, a.years), 0);
  return quantize(explicitMax);
}

/**
 * The explicit tenure claim that {@link totalYearsExperience} DISCARDED, when
 * one exists and it materially exceeds what the date ranges accounted for.
 *
 * **Why this exists (H-040, ADR-029).** The D5b rule above is deliberate: if
 * any range parses, ranges win and every explicit "N years" claim is dropped
 * as unverifiable corroboration. That rule is defensible. What was not
 * defensible is doing it **silently** — measured, the same person with the
 * same dates scored 19.6 years / 100 / eligible when an old employer wrote
 * `Mar 2006 - Aug 2016`, and 2.9 years / 66 / INELIGIBLE when they wrote
 * `03.2006 - 08.2016`, which is ordinary European numeric notation the
 * English-only month table cannot read. The recruiter was shown "Requires at
 * least 9 years of experience; found 2.9" about someone with twenty.
 *
 * The engine is not missing the information — it extracts the claim and throws
 * it away. This surfaces what was thrown away so a caller can refuse rather
 * than assert a number it cannot support.
 *
 * Returns `null` when there is nothing to report: no explicit claim, no parsed
 * ranges (in which case the claim was USED, not discarded), or a claim that
 * does not exceed the computed total.
 */
export function discardedTenureClaim(
  attributes: readonly ExtractedAttribute[],
): { readonly claimed: number; readonly computed: number } | null {
  const yearsAttrs = attributes.filter(
    (a): a is Extract<ExtractedAttribute, { kind: 'years_experience' }> =>
      a.kind === 'years_experience',
  );

  const rangeTotal = yearsAttrs
    .filter((a) => a.isExplicitStatement !== true)
    .reduce((acc, a) => acc + a.years, 0);

  // No ranges parsed means the explicit claim was used, not discarded.
  if (rangeTotal <= 0) return null;

  const claimed = yearsAttrs
    .filter((a) => a.isExplicitStatement === true)
    .reduce((acc, a) => Math.max(acc, a.years), 0);
  if (claimed <= 0) return null;

  const computed = quantize(rangeTotal);
  if (claimed <= computed) return null;

  return { claimed, computed };
}

export function experienceRelevanceSubscore(
  requirement: ExperienceRequirement,
  totalYears: number,
): number {
  if (requirement.minYears <= 0) return 1;
  return quantize(Math.max(0, Math.min(1, totalYears / requirement.minYears)));
}

// -------------------------------------------------------------------------
// seniority
//
// HONEST CAVEAT: no job-title attribute exists in this slice's extraction
// vocabulary, so seniority is inferred SOLELY from total years of experience
// against fixed thresholds below. It is a coarse proxy, not a read of actual
// scope, reports, or title.
// -------------------------------------------------------------------------

export const SENIORITY_YEAR_THRESHOLDS: Readonly<Record<SeniorityLevel, number>> = {
  junior: 0,
  mid: 2,
  senior: 5,
  lead: 8,
  principal: 12,
};

export function inferSeniorityLevel(totalYears: number): SeniorityLevel {
  let best: SeniorityLevel = 'junior';
  for (const level of SENIORITY_LADDER) {
    if (totalYears >= SENIORITY_YEAR_THRESHOLDS[level]) best = level;
  }
  return best;
}

function ladderIndex<T>(ladder: readonly T[], value: T): number {
  return ladder.indexOf(value);
}

export function senioritySubscore(requirement: SeniorityRequirement, totalYears: number): number {
  const requiredIndex = ladderIndex(SENIORITY_LADDER, requirement.level);
  if (requiredIndex <= 0) return 1;
  const candidateIndex = ladderIndex(SENIORITY_LADDER, inferSeniorityLevel(totalYears));
  return quantize(Math.max(0, Math.min(1, candidateIndex / requiredIndex)));
}

// -------------------------------------------------------------------------
// education_certs
// -------------------------------------------------------------------------

export function bestDegreeLevel(attributes: readonly ExtractedAttribute[]): DegreeLevel | null {
  let best: DegreeLevel | null = null;
  let bestIndex = -1;
  for (const attr of attributes) {
    if (attr.kind !== 'education') continue;
    const idx = ladderIndex(DEGREE_LADDER, attr.degreeLevel);
    if (idx > bestIndex) {
      bestIndex = idx;
      best = attr.degreeLevel;
    }
  }
  return best;
}

export function hasCertification(
  canonicalId: string,
  attributes: readonly ExtractedAttribute[],
): boolean {
  return attributes.some(
    (a): a is CertificationAttribute => a.kind === 'certification' && a.canonicalId === canonicalId,
  );
}

function degreeSubscore(
  requirement: EducationRequirement,
  attributes: readonly ExtractedAttribute[],
): number {
  const candidate = bestDegreeLevel(attributes);
  if (candidate === null) return 0;
  const requiredIndex = ladderIndex(DEGREE_LADDER, requirement.minDegreeLevel);
  if (requiredIndex <= 0) return 1;
  const candidateIndex = ladderIndex(DEGREE_LADDER, candidate);
  return Math.max(0, Math.min(1, candidateIndex / requiredIndex));
}

function certificationsSubscore(
  requiredCertifications: readonly string[],
  attributes: readonly ExtractedAttribute[],
): number {
  if (requiredCertifications.length === 0) return 1;
  const met = requiredCertifications.filter((id) => hasCertification(id, attributes)).length;
  return met / requiredCertifications.length;
}

export function educationCertsSubscore(
  requirement: EducationRequirement,
  attributes: readonly ExtractedAttribute[],
): number {
  const degree = degreeSubscore(requirement, attributes);
  const requiredCertifications = requirement.requiredCertifications ?? [];
  if (requiredCertifications.length === 0) return quantize(degree);
  const certs = certificationsSubscore(requiredCertifications, attributes);
  return quantize((degree + certs) / 2);
}
