import type { SectionName } from './sections.js';

/**
 * Pure text -> structured attributes (Section 2 of the engine task).
 *
 * Every attribute is span-carrying: `sourceSpan` is a character-offset range
 * into the ORIGINAL input text, `[start, end)`. This is mandatory (Section
 * 6.2) — it is what lets the UI highlight the exact evidence for a match.
 * `assertValidSpan` in `./span.js` is the invariant check; every extractor in
 * this directory calls it before emitting an attribute.
 */

export type AttributeKind =
  | 'skill'
  | 'years_experience'
  | 'education'
  | 'certification'
  | 'unreadable_date_range'
  | 'unreadable_section';

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

/**
 * An employment date range the engine can PROVE it read (E2/E3, ADR-029,
 * closing H-089/H-095). `experience.ts` extends `DATE_TOKEN` to consume a
 * full three-part numeric date whatever its separator, then classifies it:
 * exactly one leading number in 13-31 resolves unambiguously (the existing
 * B.4 rule); both numbers <=12 is genuinely ambiguous between DD/MM and
 * MM/DD and this attribute is emitted instead of a guess.
 *
 * This is the "unaccounted-for evidence" ADR-029 Decision 1 requires the
 * engine to surface rather than silently drop or silently resolve: a
 * `\d{1,2}[/.-]\d{1,2}[/.-]\d{4}` token (or the "Present" it is paired
 * with) that a range could not read. It is never summed into
 * `totalYearsExperience` — see `unreadableEmploymentDates` in
 * `../scoring/dimensions.js`, which turns this into a
 * `unreadable_employment_dates` `Reservation` (`../scoring/types.js`).
 */
export interface UnreadableDateRangeAttribute extends BaseAttribute {
  readonly kind: 'unreadable_date_range';
  /**
   * A LOWER BOUND, in years, on the tenure this range represents. Computed
   * by resolving the ambiguous side(s) two ways — DD/MM and MM/DD — and
   * taking the minimum resulting duration. That number is true under
   * EITHER locale reading, so reporting it commits to neither (ADR-029's
   * "materiality is computed, not guessed").
   */
  readonly minPossibleYears: number;
}

/**
 * Text inside a recognised CV section that the engine could not read, in a
 * section whose dimension it then found NO other evidence for (H-041).
 *
 * **Why this exists.** A foreign degree line yields no education attribute, and
 * the engine then reports "Requires at least a bachelor degree" — asserting a
 * negative from silence about a candidate who holds one. Measured, that flipped
 * the same person between 100/eligible and 50/ineligible on the language their
 * degree was written in.
 *
 * The engine cannot read the line, and it cannot be made to: a person's NAME is
 * foreign text too, and no line-level classifier separates the two (H-112). So
 * this does not try to read it. It records that unread text was there, so
 * scoring can decline to assert a negative rather than assert a wrong one —
 * ADR-029's principle, the same remedy shape as H-040 and H-089.
 *
 * Produced in `apps/server` (the language detector lives there; `packages/core`
 * must never import an inference runtime — see `core-determinism.test.mjs`) and
 * consumed by `reservationsFor`.
 */
export interface UnreadableSectionAttribute extends BaseAttribute {
  readonly kind: 'unreadable_section';
  /** The section the unread line sat in, which decides which dimension's
   *  must-have may no longer be asserted from silence. */
  readonly section: SectionName;
}

export type ExtractedAttribute =
  | UnreadableSectionAttribute
  | SkillAttribute
  | YearsExperienceAttribute
  | EducationAttribute
  | CertificationAttribute
  | UnreadableDateRangeAttribute;

/**
 * Reference "now" for date-range parsing ("... - Present"). Section 6.6
 * forbids wall-clock reads inside packages/core, so the caller (apps/server)
 * must supply it explicitly — the same discipline `roundHalfUp`'s docstring
 * states for timestamps generally.
 */
export interface ExtractionOptions {
  readonly referenceDate: { readonly year: number; readonly month: number };
}
