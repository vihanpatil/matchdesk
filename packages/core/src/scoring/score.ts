import type { ExtractedAttribute, SkillAttribute } from '../extraction/types.js';
import type { SectionName } from '../extraction/sections.js';
import { quantize, roundHalfUp } from '../numeric/round.js';
import type { SemanticMatcher } from './cascade.js';
import {
  discardedTenureClaim,
  educationCertsSubscore,
  experienceRelevanceSubscore,
  matchAllSkillRequirements,
  senioritySubscore,
  skillsSubscore,
  totalYearsExperience,
  unreadableEmploymentDates,
} from './dimensions.js';
import { evaluateEligibility } from './eligibility.js';
import { buildExplanation } from './explain.js';
import type {
  Candidate,
  DimensionContribution,
  DimensionId,
  EligibilityResult,
  Job,
  RankedCandidates,
  Reservation,
  ScoreResult,
} from './types.js';

interface ActiveDimension {
  readonly dimension: DimensionId;
  readonly weight: number;
  readonly subscore: number;
}

/**
 * Rejects a job whose dimension weights are not usable (H-028 D8, closed by
 * H-050). `docs/PRODUCT_DECISIONS.md` requires weights to be non-negative;
 * nothing enforced it, and an adversarial probe through the pipeline scored a
 * candidate **100 out of 100 with `skills.weight = -5`**. A negative weight
 * inverts a dimension's meaning — a candidate is rewarded for NOT matching —
 * and the resulting number is presented to a recruiter as a match score with
 * no indication anything is wrong.
 *
 * Throws rather than clamping. A negative weight is not a preference to be
 * silently corrected; it means the caller's configuration is wrong, and a
 * tool whose entire premise is traceable numbers must not quietly reinterpret
 * a job's definition.
 */
function assertUsableWeights(job: Job): void {
  const weights: readonly (readonly [string, number | undefined])[] = [
    ['skills', job.skills?.weight],
    ['experience', job.experience?.weight],
    ['seniority', job.seniority?.weight],
    ['educationCerts', job.educationCerts?.weight],
  ];

  for (const [name, weight] of weights) {
    if (weight === undefined) continue;
    if (!Number.isFinite(weight)) {
      throw new Error(
        `scoreCandidate: job "${job.id}" has a non-finite ${name} weight (${String(weight)}). ` +
          'Weights must be finite, non-negative numbers.',
      );
    }
    if (weight < 0) {
      throw new Error(
        `scoreCandidate: job "${job.id}" has a negative ${name} weight (${String(weight)}). ` +
          'Weights must be non-negative (docs/PRODUCT_DECISIONS.md) — a negative weight rewards ' +
          'a candidate for NOT matching, which cannot be presented as a match score.',
      );
    }
  }
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
 * Rejects a job that states no requirement for ANY dimension (H-028 D8,
 * triaged and closed by H-066).
 *
 * Measured before the fix: `scoreCandidate({ id: 'j' }, candidate)` returned
 * **score 0 with `eligible: true`, for every candidate.** Zero is a claim
 * about a person — that they match nothing — and it is indistinguishable to a
 * recruiter from a genuine no-match. Under ADR-005 a dimension is N/A only
 * when the job states no requirement for it; a job where that is true of every
 * dimension has not said what it wants, so there is nothing to be a match
 * with. No number is defensible, not 0 and not 100.
 *
 * Throws for the same reason {@link assertUsableWeights} throws rather than
 * clamping (H-050): a degenerate job configuration is a caller error, and a
 * tool whose premise is traceable numbers must not answer a question that was
 * never asked.
 *
 * **Why this was fixed rather than filed as unreachable.** No caller can build
 * such a job today — there is no API and no UI, so the only construction site
 * is a test. That argument is worthless as a gate precondition, because ADR-023
 * E5 exists to certify the engine BEFORE `apps/web` is built, and the argument
 * expires the moment it is. A defect whose only defence is "nothing calls it
 * yet" is one that lands the day something does.
 */
function assertJobStatesRequirements(job: Job, active: readonly ActiveDimension[]): void {
  if (active.length > 0) return;
  throw new Error(
    `scoreCandidate: job "${job.id}" activates no scoring dimension — it states no skills, ` +
      'experience, seniority or education requirement. A score against a job that asked for ' +
      "nothing is not a match score (ADR-005); confirm the job's requirements before scoring.",
  );
}

/**
 * Renormalizes weights across active dimensions (Section 6.4). If every
 * active weight is non-positive — a degenerate job configuration — falls
 * back to equal weighting rather than dividing by zero, so an all-zero-weight
 * job still scores rather than throwing.
 *
 * `active` is never empty here: {@link assertJobStatesRequirements} runs
 * first, so `1 / active.length` cannot be `Infinity`. The guard that used to
 * sit at the top of this function became unreachable when that check landed
 * and was removed rather than left as dead code a mutant could survive in.
 */
function contributionsFor(active: readonly ActiveDimension[]): readonly DimensionContribution[] {
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
 * Reservations for this pair (ADR-029, closes H-040, H-089, H-095).
 *
 * Two independent sources, both surfaced rather than left to silently change
 * a number:
 *
 * 1. **`unverified_tenure_claim` (H-040).** An explicit tenure claim that
 *    {@link totalYearsExperience} discarded in favour of parsed date ranges.
 *    Discarding it is the correct rule — a verifiable range should beat a
 *    self-reported total — but doing it silently produced a wrong number
 *    about a real person, decided by nothing more than the date format a
 *    previous employer happened to use.
 * 2. **`unreadable_employment_dates` (H-089/H-095).** A date range the
 *    engine could not read at all — genuinely ambiguous between DD/MM and
 *    MM/DD. `discardedTenureClaim` is blind here BY CONSTRUCTION (H-094
 *    correction 4): it needs an explicit claim to disagree with, and an
 *    unreadable range never produced a first number to compare against.
 *    {@link unreadableEmploymentDates} is the separate trigger this needs.
 *
 * **Materiality is computed for both, never guessed.** For (1), re-run the
 * experience gate using the discarded claim. For (2), re-run it using the
 * COMPUTED total plus the unreadable range's lower-bound duration (itself
 * computed under both locale readings, see `extractYearsExperience`) — if
 * that would cross the must-have threshold, the number on screen cannot be
 * presented as complete and the reservation blocks. If it would not, the
 * reservation is still surfaced so the recruiter can see the gap.
 */
/**
 * Which dimension's must-have a given CV section feeds. Only sections whose
 * content can decide an eligibility gate appear here (H-041).
 */
const SECTION_DIMENSION: Partial<Record<SectionName, DimensionId>> = {
  education: 'education_certs',
  certifications: 'education_certs',
  experience: 'experience_relevance',
  skills: 'skills',
};

/**
 * A must-have reported UNMET while the engine holds unread text in that very
 * section (H-041). `unreadable_section` attributes are only emitted when the
 * dimension had NO other evidence, so reaching here means the engine is about
 * to assert a negative purely from silence.
 *
 * Blocking without a materiality computation, unlike
 * `unverified_tenure_claim`: an unmet must-have IS the eligibility verdict, so
 * there is no non-material version of it to surface instead.
 */
function unsupportedNegatives(candidate: Candidate, eligibility: EligibilityResult): Reservation[] {
  const unread = candidate.attributes.filter(
    (a): a is Extract<ExtractedAttribute, { kind: 'unreadable_section' }> =>
      a.kind === 'unreadable_section',
  );
  if (unread.length === 0) return [];

  const reservations: Reservation[] = [];
  for (const requirement of eligibility.unmet) {
    const blocker = unread.find((a) => SECTION_DIMENSION[a.section] === requirement.dimension);
    if (blocker === undefined) continue;
    reservations.push({
      kind: 'unsupported_negative',
      blocking: true,
      dimension: requirement.dimension,
      detail:
        `"${requirement.reason}" cannot be asserted: the ${blocker.section} section ` +
        `contains text the engine could not read ("${blocker.value.slice(0, 60)}"), and no ` +
        `${blocker.section} evidence was extracted at all. This is a document we could not ` +
        `fully read, not a candidate who does not meet the requirement.`,
    });
  }
  return reservations;
}

function reservationsFor(job: Job, candidate: Candidate): Reservation[] {
  const requirement = job.experience?.requirement;
  const gates = requirement?.mustHave === true;
  const reservations: Reservation[] = [];

  const discarded = discardedTenureClaim(candidate.attributes);
  if (discarded !== null) {
    const flips =
      gates &&
      requirement.minYears > discarded.computed &&
      requirement.minYears <= discarded.claimed;

    reservations.push({
      kind: 'unverified_tenure_claim',
      blocking: flips,
      detail:
        `Verified ${String(discarded.computed)} years from dated roles, but the document ` +
        `states ${String(discarded.claimed)}. Some employment dates could not be read, so ` +
        `the tenure figure is a lower bound rather than a total.`,
      claimed: discarded.claimed,
      computed: discarded.computed,
    });
  }

  const unreadable = unreadableEmploymentDates(candidate.attributes);
  if (unreadable !== null) {
    const computed = totalYearsExperience(candidate.attributes);
    const withLowerBound = quantize(computed + unreadable.minPossibleYears);
    const flips =
      gates && computed < requirement.minYears && withLowerBound >= requirement.minYears;

    reservations.push({
      kind: 'unreadable_employment_dates',
      blocking: flips,
      detail:
        `Verified ${String(computed)} years from dated roles, but at least one employment ` +
        `date range could not be read — its notation (e.g. "03/04/2019") is genuinely ` +
        `ambiguous between day-first and month-first. Adding a conservative lower bound of ` +
        `${String(unreadable.minPossibleYears)} years, true under either reading, would bring ` +
        `the total to at least ${String(withLowerBound)}.`,
      minPossibleYears: unreadable.minPossibleYears,
      computed,
    });
  }

  return reservations;
}

/**
 * Scores one candidate against one job (Section 6.2-6.7). Combines the
 * eligibility partition (ADR-007), the renormalized weighted sum over
 * job-active dimensions (ADR-005), the explanation object, and any
 * {@link Reservation} the engine could not reconcile (ADR-029).
 */
export function scoreCandidate(
  job: Job,
  candidate: Candidate,
  semanticMatcher?: SemanticMatcher,
): ScoreResult {
  assertUsableWeights(job);

  const active = activeDimensions(job, candidate, semanticMatcher);
  assertJobStatesRequirements(job, active);

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
    reservations: [
      ...reservationsFor(job, candidate),
      ...unsupportedNegatives(candidate, eligibility),
    ],
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
