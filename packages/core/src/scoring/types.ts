import type {
  DegreeLevel,
  ExtractedAttribute,
  SkillAttribute,
  SourceSpan,
} from '../extraction/types.js';

/**
 * The rule-based scoring cascade, gates and explanation (Section 3 of the
 * engine task). Semantic/embedding matching is cascade step 4 and is
 * explicitly out of scope for this slice (ADR-011) — see `SemanticMatcher`
 * in `./cascade.ts` for the typed seam it will plug into.
 */

export type DimensionId = 'skills' | 'experience_relevance' | 'seniority' | 'education_certs';

export const DIMENSION_IDS: readonly DimensionId[] = [
  'skills',
  'experience_relevance',
  'seniority',
  'education_certs',
];

/**
 * How a candidate's skill attribute related to a job's required skill.
 * 'semantic' is cascade step 4 (ADR-011: out of scope for this slice) —
 * included in the type now so the seam in `./cascade.ts` is honestly typed
 * rather than bolted on later with a union change nothing else can rely on.
 */
export type MatchType = 'exact' | 'alias' | 'related' | 'semantic' | 'none';

export interface SkillRequirement {
  readonly id: string;
  readonly canonicalSkillId: string;
  readonly label: string;
  readonly mustHave: boolean;
}

export interface SkillsDimensionSpec {
  readonly weight: number;
  readonly requirements: readonly SkillRequirement[];
}

export interface ExperienceRequirement {
  readonly minYears: number;
  readonly mustHave?: boolean;
}

export interface ExperienceDimensionSpec {
  readonly weight: number;
  readonly requirement: ExperienceRequirement;
}

export type SeniorityLevel = 'junior' | 'mid' | 'senior' | 'lead' | 'principal';

export const SENIORITY_LADDER: readonly SeniorityLevel[] = [
  'junior',
  'mid',
  'senior',
  'lead',
  'principal',
];

export interface SeniorityRequirement {
  readonly level: SeniorityLevel;
  readonly mustHave?: boolean;
}

export interface SeniorityDimensionSpec {
  readonly weight: number;
  readonly requirement: SeniorityRequirement;
}

export const DEGREE_LADDER: readonly DegreeLevel[] = [
  'high_school',
  'associate',
  'bachelor',
  'master',
  'doctorate',
  'professional',
];

export interface EducationRequirement {
  readonly minDegreeLevel: DegreeLevel;
  readonly mustHave?: boolean;
  readonly requiredCertifications?: readonly string[];
}

export interface EducationCertsDimensionSpec {
  readonly weight: number;
  readonly requirement: EducationRequirement;
}

/**
 * A job's requirements, dimension by dimension. ADR-005 is binding: a
 * dimension is "N/A" (excluded from the weighted sum and its renormalization)
 * ONLY when this object omits it. Nothing about a candidate can ever change
 * which dimensions are active for a given job, which is what makes
 * monotonicity provable rather than merely likely.
 */
export interface Job {
  readonly id: string;
  readonly skills?: SkillsDimensionSpec;
  readonly experience?: ExperienceDimensionSpec;
  readonly seniority?: SeniorityDimensionSpec;
  readonly educationCerts?: EducationCertsDimensionSpec;
}

export interface Candidate {
  readonly id: string;
  /** ISO-8601 timestamp string; used only as a deterministic tie-break key. */
  readonly createdAt: string;
  readonly attributes: readonly ExtractedAttribute[];
}

export interface UnmetRequirement {
  readonly dimension: DimensionId;
  readonly label: string;
  readonly reason: string;
}

export interface EligibilityResult {
  readonly eligible: boolean;
  readonly unmet: readonly UnmetRequirement[];
}

export interface DimensionContribution {
  readonly dimension: DimensionId;
  /** Renormalized weight actually used, in [0, 1]; sums to 1 across active dims. */
  readonly weight: number;
  /** Dimension subscore in [0, 1]. */
  readonly subscore: number;
  /** `weight * subscore`, quantized. */
  readonly contribution: number;
}

export interface StrengthItem {
  readonly dimension: DimensionId;
  readonly label: string;
  readonly matchType: MatchType | 'meets_requirement';
  readonly contribution: number;
  readonly evidence: SourceSpan | null;
}

export interface GapItem {
  readonly dimension: DimensionId;
  readonly label: string;
  readonly reason: string;
}

export interface ScoreComposition {
  readonly dimensions: readonly DimensionContribution[];
  /** Sum of `dimensions[*].contribution`, quantized; equals `raw` ± rounding. */
  readonly total: number;
}

export interface Explanation {
  /** Ranked descending by `contribution`; ties broken by dimension then label. */
  readonly strengths: readonly StrengthItem[];
  readonly gaps: {
    readonly mustHave: readonly GapItem[];
    readonly preferred: readonly GapItem[];
  };
  readonly composition: ScoreComposition;
  readonly caveats: readonly string[];
}

/**
 * Something the engine could not fully account for while producing this score
 * (ADR-029). The engine must never present a number as complete while it holds
 * evidence it could not reconcile — the burden is on the engine to show the gap
 * does not matter, never on the reader to notice.
 *
 * `blocking` means the unaccounted-for evidence would CHANGE THE ELIGIBILITY
 * VERDICT, which is computable: re-run eligibility using the discarded value
 * and compare. A caller that persists or displays a score must refuse to do so
 * when a blocking reservation is present.
 *
 * **Stated residual:** a non-blocking reservation can still move the SCORE
 * (and therefore rank order) without flipping eligibility. That is surfaced,
 * not refused, because refusing on any score movement would fire constantly —
 * but it means "non-blocking" is not the same as "harmless".
 */
export interface Reservation {
  readonly kind: 'unverified_tenure_claim';
  readonly blocking: boolean;
  /** Recruiter-facing sentence naming both numbers. */
  readonly detail: string;
  readonly claimed: number;
  readonly computed: number;
}

export interface ScoreResult {
  readonly candidateId: string;
  readonly createdAt: string;
  /** Final integer score in [0, 100]. */
  readonly score: number;
  /** Raw weighted-sum score in [0, 1] before `* 100` and rounding. */
  readonly raw: number;
  readonly eligibility: EligibilityResult;
  readonly dimensions: readonly DimensionContribution[];
  readonly explanation: Explanation;
  /** Empty when the engine could account for everything it read (ADR-029). */
  readonly reservations: readonly Reservation[];
}

export interface RankedCandidates {
  readonly eligible: readonly ScoreResult[];
  readonly ineligible: readonly ScoreResult[];
}

export type { SkillAttribute };
