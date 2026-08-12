import type { SkillAttribute } from '../extraction/types.js';
import { quantize, roundHalfUp } from '../numeric/round.js';
import type { SemanticMatcher } from './cascade.js';
import {
  educationCertsSubscore,
  experienceRelevanceSubscore,
  matchAllSkillRequirements,
  senioritySubscore,
  skillsSubscore,
  totalYearsExperience,
} from './dimensions.js';
import { evaluateEligibility } from './eligibility.js';
import { buildExplanation } from './explain.js';
import type {
  Candidate,
  DimensionContribution,
  DimensionId,
  Job,
  RankedCandidates,
  ScoreResult,
} from './types.js';

interface ActiveDimension {
  readonly dimension: DimensionId;
  readonly weight: number;
  readonly subscore: number;
}

function activeDimensions(
  job: Job,
  candidate: Candidate,
  semanticMatcher?: SemanticMatcher,
): readonly ActiveDimension[] {
  const candidateSkills = candidate.attributes.filter(
    (a): a is SkillAttribute => a.kind === 'skill',
  );
  const totalYears = totalYearsExperience(candidate.attributes);
  const active: ActiveDimension[] = [];

  if (job.skills !== undefined) {
    const matches = matchAllSkillRequirements(job.skills, candidateSkills, semanticMatcher);
    active.push({
      dimension: 'skills',
      weight: job.skills.weight,
      subscore: skillsSubscore(matches),
    });
  }
  if (job.experience !== undefined) {
    active.push({
      dimension: 'experience_relevance',
      weight: job.experience.weight,
      subscore: experienceRelevanceSubscore(job.experience.requirement, totalYears),
    });
  }
  if (job.seniority !== undefined) {
    active.push({
      dimension: 'seniority',
      weight: job.seniority.weight,
      subscore: senioritySubscore(job.seniority.requirement, totalYears),
    });
  }
  if (job.educationCerts !== undefined) {
    active.push({
      dimension: 'education_certs',
      weight: job.educationCerts.weight,
      subscore: educationCertsSubscore(job.educationCerts.requirement, candidate.attributes),
    });
  }

  return active;
}

/**
 * Renormalizes weights across active dimensions (Section 6.4). If every
 * active weight is non-positive — a degenerate job configuration — falls
 * back to equal weighting rather than dividing by zero, so no scoring
 * function ever throws on an all-zero-weight job.
 */
function contributionsFor(active: readonly ActiveDimension[]): readonly DimensionContribution[] {
  if (active.length === 0) return [];
  const totalWeight = active.reduce((acc, d) => acc + d.weight, 0);
  const useEqualWeights = totalWeight <= 0;
  const equalWeight = 1 / active.length;

  return active.map((d) => {
    const weight = useEqualWeights ? equalWeight : d.weight / totalWeight;
    return {
      dimension: d.dimension,
      weight,
      subscore: d.subscore,
      contribution: quantize(weight * d.subscore),
    };
  });
}

/**
 * Scores one candidate against one job (Section 6.2-6.7). Combines the
 * eligibility partition (ADR-007), the renormalized weighted sum over
 * job-active dimensions (ADR-005), and the explanation object.
 */
export function scoreCandidate(
  job: Job,
  candidate: Candidate,
  semanticMatcher?: SemanticMatcher,
): ScoreResult {
  const active = activeDimensions(job, candidate, semanticMatcher);
  const dimensions = contributionsFor(active);
  const raw = Math.max(
    0,
    Math.min(1, quantize(dimensions.reduce((acc, d) => acc + d.contribution, 0))),
  );
  const score = Math.max(0, Math.min(100, roundHalfUp(raw * 100, 0)));

  const eligibility = evaluateEligibility(job, candidate);

  const candidateSkills = candidate.attributes.filter(
    (a): a is SkillAttribute => a.kind === 'skill',
  );
  const skillMatches =
    job.skills !== undefined
      ? matchAllSkillRequirements(job.skills, candidateSkills, semanticMatcher)
      : [];

  const explanation = buildExplanation({ job, candidate, dimensions, skillMatches, eligibility });

  return {
    candidateId: candidate.id,
    createdAt: candidate.createdAt,
    score,
    raw,
    eligibility,
    dimensions,
    explanation,
  };
}

/** Deterministic comparator: score desc, then createdAt asc, then id asc. */
function compareResults(a: ScoreResult, b: ScoreResult): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.candidateId !== b.candidateId) return a.candidateId < b.candidateId ? -1 : 1;
  return 0;
}

/**
 * Scores and ranks every candidate against one job, partitioning them into
 * `eligible` and `ineligible` groups (ADR-007). This partition is
 * STRUCTURAL: an ineligible candidate can never outrank an eligible one,
 * because the two groups are always kept in separate arrays rather than
 * merged and re-sorted by score alone.
 */
export function rankCandidates(
  job: Job,
  candidates: readonly Candidate[],
  semanticMatcher?: SemanticMatcher,
): RankedCandidates {
  const results = candidates.map((c) => scoreCandidate(job, c, semanticMatcher));
  const eligible = results.filter((r) => r.eligibility.eligible).sort(compareResults);
  const ineligible = results.filter((r) => !r.eligibility.eligible).sort(compareResults);
  return { eligible, ineligible };
}
