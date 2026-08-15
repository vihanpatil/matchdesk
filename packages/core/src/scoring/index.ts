export type { SemanticMatcher, SkillMatchResult } from './cascade.js';
export {
  ALIAS_SUBSCORE,
  EXACT_SUBSCORE,
  NONE_SUBSCORE,
  RELATED_SUBSCORE,
  matchSkillRequirement,
} from './cascade.js';
export type { SkillRequirementMatch } from './dimensions.js';
export {
  SENIORITY_YEAR_THRESHOLDS,
  bestDegreeLevel,
  discardedTenureClaim,
  educationCertsSubscore,
  experienceRelevanceSubscore,
  hasCertification,
  inferSeniorityLevel,
  matchAllSkillRequirements,
  senioritySubscore,
  skillsSubscore,
  totalYearsExperience,
  unreadableEmploymentDates,
} from './dimensions.js';
export { evaluateEligibility } from './eligibility.js';
export { buildExplanation } from './explain.js';
export { rankCandidates, scoreCandidate } from './score.js';
export { DEGREE_LADDER, DIMENSION_IDS, SENIORITY_LADDER } from './types.js';
export type {
  Candidate,
  DimensionContribution,
  DimensionId,
  EducationCertsDimensionSpec,
  EducationRequirement,
  EligibilityResult,
  ExperienceDimensionSpec,
  ExperienceRequirement,
  Explanation,
  GapItem,
  Job,
  MatchType,
  RankedCandidates,
  Reservation,
  ScoreComposition,
  ScoreResult,
  SeniorityDimensionSpec,
  SeniorityLevel,
  SeniorityRequirement,
  SkillRequirement,
  SkillsDimensionSpec,
  StrengthItem,
  UnmetRequirement,
  UnreadableEmploymentDatesReservation,
  UnverifiedTenureClaimReservation,
} from './types.js';
