/**
 * CV generators for metamorphic testing.
 *
 * Test-support only — excluded from the emitting build (see
 * `packages/core/tsconfig.json`), so nothing here ships in `dist`.
 *
 * WHY THIS EXISTS. Five separate defects reached a green suite because the
 * person writing the test inputs was the person who wrote the code being
 * tested, and they shared a blind spot (HONESTY_LOG H-004, H-013, H-022,
 * H-025, H-028). Hand-written examples can only catch failures someone
 * imagined. Generated CVs, varied along the axes real CVs actually vary
 * along — header wording, name, layout order, line endings — catch failures
 * nobody imagined.
 *
 * The vocabularies below are deliberately drawn from real-world CV conventions
 * rather than from the extractor's own pattern tables. If a header appears here
 * that the extractor does not recognise, that is the point.
 */

import fc from 'fast-check';

/**
 * Names chosen to exercise the boundary logic, not for variety's sake.
 * `Rémi`, `Résumé` and `R&D` each produced a spurious exact match for the
 * single-letter skill `r` (H-028 D3) — a defect that fired on accents and so
 * correlated with non-English names.
 */
export const NAMES: readonly string[] = [
  'Alex Taylor',
  'Jordan Rivera',
  'Rémi Dubois',
  'José García',
  'Anne-Marie O’Brien',
  'Zoë Ashworth',
  'Łukasz Nowak',
  '李 明',
  'Ravi Subramanian',
  'Bjørn Sørensen',
];

/** Experience-section headers seen in real CVs. 8 of these were unrecognised (H-028 D1). */
export const EXPERIENCE_HEADERS: readonly string[] = [
  'Experience',
  'Work Experience',
  'Professional Experience',
  'Employment History',
  'Work History',
  'Career History',
  'Employment',
  'Relevant Experience',
  'Experience:',
  'WORK EXPERIENCE',
  'Professional Background',
  'Career Summary',
];

export const SKILLS_HEADERS: readonly string[] = [
  'Skills',
  'Technical Skills',
  'Key Skills',
  'Core Skills',
  'Skills & Tools',
  'Skills:',
  'TECHNICAL SKILLS',
];

export const EDUCATION_HEADERS: readonly string[] = [
  'Education',
  'Education & Training',
  'Academic Background',
  'Education:',
  'EDUCATION',
];

/**
 * Job titles containing words that look degree-shaped. None of these is a
 * qualification; `Associate Software Engineer` produced a phantom associate
 * degree worth +50 points (H-028 D4).
 */
export const JOB_TITLES: readonly string[] = [
  'Software Engineer',
  'Senior Software Engineer',
  'Associate Software Engineer',
  'Associate Director of Engineering',
  'Backend Developer',
  'Staff Engineer',
  'Bachelor Party Coordinator',
  'Master Data Analyst',
];

/** Degree phrasings across conventions. British forms extracted as nothing (H-022). */
export const DEGREES: readonly string[] = [
  'BSc Computer Science',
  'MSc Data Science',
  "Bachelor's in Computer Science",
  'B.S. in Computer Science',
  'MEng Software Engineering',
  'PhD Machine Learning',
];

export interface ExperienceEntry {
  readonly title: string;
  readonly range: string;
}

export interface CvSpec {
  readonly name: string;
  readonly skillsHeader: string;
  readonly skills: readonly string[];
  readonly experienceHeader: string;
  readonly experience: readonly ExperienceEntry[];
  readonly educationHeader: string;
  readonly education: readonly string[];
  readonly educationRange: string;
  /** Real CVs put education first about as often as last. */
  readonly educationFirst: boolean;
  readonly lineEnding: '\n' | '\r\n';
}

/** Renders a spec to CV text. Deterministic — no clock, no randomness. */
export function renderCv(spec: CvSpec): string {
  const skillsBlock = [spec.skillsHeader, spec.skills.join(', ')];

  const experienceBlock = [
    spec.experienceHeader,
    ...spec.experience.flatMap((e) => [e.title, e.range]),
  ];

  const educationBlock =
    spec.education.length === 0
      ? []
      : [spec.educationHeader, ...spec.education.map((d) => `${d}${spec.educationRange}`)];

  const body = spec.educationFirst
    ? [...educationBlock, '', ...skillsBlock, '', ...experienceBlock]
    : [...skillsBlock, '', ...experienceBlock, '', ...educationBlock];

  return [spec.name, '', ...body].join(spec.lineEnding);
}

/** A CV spec arbitrary. Every axis is one real CVs actually vary along. */
export function cvSpecArbitrary(skillPool: readonly string[]): fc.Arbitrary<CvSpec> {
  return fc.record({
    name: fc.constantFrom(...NAMES),
    skillsHeader: fc.constantFrom(...SKILLS_HEADERS),
    skills: fc.uniqueArray(fc.constantFrom(...skillPool), { minLength: 1, maxLength: 5 }),
    experienceHeader: fc.constantFrom(...EXPERIENCE_HEADERS),
    experience: fc.array(
      fc.record({
        title: fc.constantFrom(...JOB_TITLES),
        range: fc.constantFrom('Jan 2019 - Dec 2021', 'Mar 2022 - Present', '2015 - 2018'),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    educationHeader: fc.constantFrom(...EDUCATION_HEADERS),
    education: fc.uniqueArray(fc.constantFrom(...DEGREES), { minLength: 0, maxLength: 2 }),
    educationRange: fc.constantFrom('', ', 2011', ', 2008 - 2011'),
    educationFirst: fc.boolean(),
    lineEnding: fc.constantFrom<'\n' | '\r\n'>('\n', '\r\n'),
  });
}

/**
 * A comparable summary of extracted attributes, deliberately dropping spans.
 *
 * Spans legitimately move when text changes — a metamorphic relation that
 * compared them would fail for uninteresting reasons. What must stay stable is
 * *what was found*, not where.
 */
export function summarize(
  attributes: readonly { kind: string; normalizedValue: string }[],
): readonly string[] {
  return attributes
    .map((a) => `${a.kind}:${a.normalizedValue}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Skills only, for relations about skill extraction specifically. */
export function summarizeSkills(
  attributes: readonly { kind: string; normalizedValue: string }[],
): readonly string[] {
  return summarize(attributes.filter((a) => a.kind === 'skill'));
}
