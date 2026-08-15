export { extractCertifications } from './certifications.js';
export { extractEducation } from './education.js';
export { extractYearsExperience } from './experience.js';
export { extractAttributes } from './extract.js';
export { segmentLines } from './bullets.js';
export { detectSections } from './sections.js';
export type { Section, SectionName } from './sections.js';
export type { LineSegment } from './bullets.js';
export { assertValidSpan } from './span.js';
export { extractSkills } from './skills.js';
export type {
  AttributeKind,
  CertificationAttribute,
  DegreeLevel,
  EducationAttribute,
  ExtractedAttribute,
  ExtractionOptions,
  SkillAttribute,
  SkillExtractionMatchType,
  SourceSpan,
  UnreadableDateRangeAttribute,
  YearsExperienceAttribute,
} from './types.js';
