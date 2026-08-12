import type { SkillAttribute } from '../extraction/types.js';
import { ALIAS_SUBSCORE, matchSkillRequirement } from './cascade.js';
import {
  bestDegreeLevel,
  hasCertification,
  inferSeniorityLevel,
  totalYearsExperience,
} from './dimensions.js';
import {
  DEGREE_LADDER,
  SENIORITY_LADDER,
  type Candidate,
  type EligibilityResult,
  type Job,
  type UnmetRequirement,
} from './types.js';

/**
 * ADR-007's eligibility predicate: must-have requirements PARTITION results
 * rather than entering the weighted sum. This is the one and only place a
 * "must-have" is checked. Every unmet requirement is named — never hidden,
 * never merged into a single boolean.
 *
 * A must-have SKILL requirement counts as met only for an "exact" or "alias"
 * cascade match (subscore >= 0.95). A merely "related" match (0.70) is
 * plausible partial evidence for a PREFERRED requirement, but is
 * deliberately not enough to satisfy a hard gate — a recruiter who marked a
 * skill must-have wants that skill, not something taxonomy-adjacent to it.
 */
export function evaluateEligibility(job: Job, candidate: Candidate): EligibilityResult {
  const unmet: UnmetRequirement[] = [];
  const candidateSkills = candidate.attributes.filter(
    (a): a is SkillAttribute => a.kind === 'skill',
  );
  const totalYears = totalYearsExperience(candidate.attributes);

  if (job.skills !== undefined) {
    for (const requirement of job.skills.requirements) {
      if (!requirement.mustHave) continue;
      const match = matchSkillRequirement(requirement.canonicalSkillId, candidateSkills);
      if (match.subscore >= ALIAS_SUBSCORE) continue;
      unmet.push({
        dimension: 'skills',
        label: requirement.label,
        reason:
          match.matchType === 'related'
            ? `Must-have skill "${requirement.label}" was not found; only a related skill was.`
            : `Must-have skill "${requirement.label}" was not found.`,
      });
    }
  }

  if (job.experience?.requirement.mustHave === true) {
    const { minYears } = job.experience.requirement;
    if (totalYears < minYears) {
      unmet.push({
        dimension: 'experience_relevance',
        label: `${String(minYears)}+ years of experience`,
        reason: `Requires at least ${String(minYears)} years of experience; found ${String(totalYears)}.`,
      });
    }
  }

  if (job.seniority?.requirement.mustHave === true) {
    const requiredIndex = SENIORITY_LADDER.indexOf(job.seniority.requirement.level);
    const candidateIndex = SENIORITY_LADDER.indexOf(inferSeniorityLevel(totalYears));
    if (candidateIndex < requiredIndex) {
      unmet.push({
        dimension: 'seniority',
        label: `${job.seniority.requirement.level} level`,
        reason: `Requires ${job.seniority.requirement.level} level or above, inferred from years of experience.`,
      });
    }
  }

  if (job.educationCerts !== undefined) {
    const { requirement } = job.educationCerts;

    if (requirement.mustHave === true) {
      const requiredIndex = DEGREE_LADDER.indexOf(requirement.minDegreeLevel);
      const candidateDegree = bestDegreeLevel(candidate.attributes);
      const candidateIndex = candidateDegree === null ? -1 : DEGREE_LADDER.indexOf(candidateDegree);
      if (candidateIndex < requiredIndex) {
        unmet.push({
          dimension: 'education_certs',
          label: `${requirement.minDegreeLevel} degree or above`,
          reason: `Requires at least a ${requirement.minDegreeLevel} degree.`,
        });
      }
    }

    // Required certifications are always a hard eligibility gate: a
    // certification listed as required is, by definition, required.
    for (const certId of requirement.requiredCertifications ?? []) {
      if (!hasCertification(certId, candidate.attributes)) {
        unmet.push({
          dimension: 'education_certs',
          label: certId,
          reason: `Requires the "${certId}" certification.`,
        });
      }
    }
  }

  return { eligible: unmet.length === 0, unmet };
}
