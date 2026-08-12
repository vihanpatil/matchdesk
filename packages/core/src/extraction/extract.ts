import { extractCertifications } from './certifications.js';
import { extractEducation } from './education.js';
import { extractYearsExperience } from './experience.js';
import { extractSkills } from './skills.js';
import type { ExtractedAttribute, ExtractionOptions } from './types.js';

/**
 * Top-level pure text -> structured attributes pipeline (Section 2). Runs
 * every extractor over the same input text and merges the results into one
 * deterministically ordered list. Different kinds are allowed to overlap in
 * span (e.g. "AWS" as a skill mention inside "AWS Certified Solutions
 * Architect" as a certification mention) — that overlap is meaningful, not a
 * bug, so only same-kind gazetteer matches suppress each other internally.
 */
export function extractAttributes(
  text: string,
  options: ExtractionOptions,
): readonly ExtractedAttribute[] {
  if (text.length === 0) return [];

  const attributes: ExtractedAttribute[] = [
    ...extractSkills(text),
    ...extractYearsExperience(text, options.referenceDate),
    ...extractEducation(text),
    ...extractCertifications(text),
  ];

  return attributes.sort(
    (a, b) => a.sourceSpan.start - b.sourceSpan.start || a.sourceSpan.end - b.sourceSpan.end,
  );
}
