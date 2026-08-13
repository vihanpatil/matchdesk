/**
 * Pure text -> structured attributes (Section 2 of the engine task).
 *
 * Every attribute is span-carrying: `sourceSpan` is a character-offset range
 * into the ORIGINAL input text, `[start, end)`. This is mandatory (Section
 * 6.2) — it is what lets the UI highlight the exact evidence for a match.
 * `assertValidSpan` in `./span.js` is the invariant check; every extractor in
 * this directory calls it before emitting an attribute.
 */

export type AttributeKind = 'skill' | 'years_experience' | 'education' | 'certification';

/** Character offsets into the input text. `end` is exclusive. */
export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

interface BaseAttribute {
  /** Raw surface text as it appeared in the input, e.g. "Postgres". */
  readonly value: string;
  /** Normalized/canonical form, e.g. "postgresql". Kind-specific meaning. */
  readonly normalizedValue: string;
  /** Extractor's confidence in this attribute, in [0, 1]. */
  readonly confidence: number;
  readonly sourceSpan: SourceSpan;
}

/** How a skill's surface text related to the taxonomy at extraction time. */
export type SkillExtractionMatchType = 'exact' | 'alias';

export interface SkillAttribute extends BaseAttribute {
  readonly kind: 'skill';
  readonly canonicalId: string;
  readonly matchType: SkillExtractionMatchType;
}

export interface YearsExperienceAttribute extends BaseAttribute {
  readonly kind: 'years_experience';
  /** Parsed, quantized number of years this piece of evidence represents. */
  readonly years: number;
  /**
   * `true` when this evidence is an explicit "N years of experience"
   * statement rather than a parsed employment date range. Absent/`false` for
   * date-range evidence. Consumers use this to avoid double-counting: an
   * explicit claim and the date ranges it describes should not both be added
   * to a total (HONESTY_LOG H-028 D5b) — see `totalYearsExperience` in
   * `../scoring/dimensions.js`.
   */
  readonly isExplicitStatement?: boolean;
}

/**
 * Degree level only — never institution name (national-origin /
 * socioeconomic-status proxy) and never graduation year (age proxy).
 * ADR-007 is binding on both.
 */
export type DegreeLevel =
  'high_school' | 'associate' | 'bachelor' | 'master' | 'doctorate' | 'professional';

export interface EducationAttribute extends BaseAttribute {
  readonly kind: 'education';
  readonly degreeLevel: DegreeLevel;
  /** Field of study, e.g. "computer science" — canonical field id or null. */
  readonly field: string | null;
}

export interface CertificationAttribute extends BaseAttribute {
  readonly kind: 'certification';
  /** Canonical certification id if recognized against the cert gazetteer. */
  readonly canonicalId: string | null;
}

export type ExtractedAttribute =
  SkillAttribute | YearsExperienceAttribute | EducationAttribute | CertificationAttribute;

/**
 * Reference "now" for date-range parsing ("... - Present"). Section 6.6
 * forbids wall-clock reads inside packages/core, so the caller (apps/server)
 * must supply it explicitly — the same discipline `roundHalfUp`'s docstring
 * states for timestamps generally.
 */
export interface ExtractionOptions {
  readonly referenceDate: { readonly year: number; readonly month: number };
}
