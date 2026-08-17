import {
  DEGREE_LADDER,
  extractAttributes,
  type DegreeLevel,
  type SourceSpan,
} from '@matchdesk/core';

/**
 * Deterministic, source-backed requirement proposal (ADR-035).
 *
 * PRODUCT_DECISIONS: "The app deterministically proposes source-backed
 * requirements from a job description. The recruiter must review and confirm
 * them before scoring. Proposed requirements start as preferred."
 *
 * There is no separate proposal engine, on purpose: the SAME gate-hardened
 * extractor that reads CVs reads the job description. Every suggestion
 * therefore carries an evidence span into the job's own text, and anything
 * the extractor cannot support is simply not proposed — a job description we
 * could not read proposes nothing rather than guessing (C7's shape).
 *
 * Nothing here is `mustHave` and no weights are decided: those are the
 * recruiter's calls, made in the UI and stored via `upsertJobScoringConfig`.
 * `DEFAULT_WEIGHTS` are PRODUCT_DECISIONS' editable per-job defaults, shipped
 * alongside the proposal so the UI has one source for them.
 */

export const DEFAULT_WEIGHTS = {
  skills: 0.4,
  experience: 0.3,
  seniority: 0.1,
  educationCerts: 0.2,
} as const;

export interface ProposedSkill {
  readonly canonicalSkillId: string;
  /** Surface text as it appeared in the job description. */
  readonly label: string;
  readonly sourceSpan: SourceSpan;
}

export interface ProposedRequirements {
  readonly skills: readonly ProposedSkill[];
  /** Highest explicit "N+ years" statement found, with its evidence. */
  readonly minYears: { readonly years: number; readonly sourceSpan: SourceSpan } | null;
  /**
   * LOWEST degree level named, deliberately: a description mentioning both
   * "Bachelor's required" and "Master's preferred" states a bachelor
   * minimum, and proposing the higher one would silently tighten a gate the
   * recruiter never asked for.
   */
  readonly minDegreeLevel: { readonly level: DegreeLevel; readonly sourceSpan: SourceSpan } | null;
  readonly certifications: readonly { readonly id: string; readonly sourceSpan: SourceSpan }[];
  readonly defaultWeights: typeof DEFAULT_WEIGHTS;
}

export function proposeRequirements(
  jobText: string,
  referenceDate: { readonly year: number; readonly month: number },
): ProposedRequirements {
  const attributes = extractAttributes(jobText, { referenceDate });

  const skills = new Map<string, ProposedSkill>();
  let minYears: ProposedRequirements['minYears'] = null;
  let minDegree: ProposedRequirements['minDegreeLevel'] = null;
  const certifications = new Map<string, { id: string; sourceSpan: SourceSpan }>();

  for (const a of attributes) {
    switch (a.kind) {
      case 'skill':
        if (!skills.has(a.canonicalId)) {
          skills.set(a.canonicalId, {
            canonicalSkillId: a.canonicalId,
            label: a.value,
            sourceSpan: a.sourceSpan,
          });
        }
        break;
      case 'years_experience':
        // Only explicit statements ("5+ years of experience"): a date range
        // in a job description is not a tenure requirement.
        if (a.isExplicitStatement === true && (minYears === null || a.years > minYears.years)) {
          minYears = { years: a.years, sourceSpan: a.sourceSpan };
        }
        break;
      case 'education':
        if (
          minDegree === null ||
          DEGREE_LADDER.indexOf(a.degreeLevel) < DEGREE_LADDER.indexOf(minDegree.level)
        ) {
          minDegree = { level: a.degreeLevel, sourceSpan: a.sourceSpan };
        }
        break;
      case 'certification':
        if (a.canonicalId !== null && !certifications.has(a.canonicalId)) {
          certifications.set(a.canonicalId, { id: a.canonicalId, sourceSpan: a.sourceSpan });
        }
        break;
      default:
        // unreadable_* attributes carry no proposable requirement.
        break;
    }
  }

  return {
    skills: [...skills.values()],
    minYears,
    minDegreeLevel: minDegree,
    certifications: [...certifications.values()],
    defaultWeights: DEFAULT_WEIGHTS,
  };
}
