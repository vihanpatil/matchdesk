import { quantize, roundHalfUp } from '../numeric/round.js';
import { assertValidSpan } from './span.js';
import { detectSections } from './sections.js';
import type { ExtractionOptions, YearsExperienceAttribute } from './types.js';

const EXPLICIT_BASE_CONFIDENCE = 0.9;
const EXPLICIT_OF_EXPERIENCE_BONUS = 0.05;
const DATE_RANGE_CONFIDENCE = 0.6;

/** Sanity bound: a single piece of evidence beyond this is treated as noise. */
const MAX_PLAUSIBLE_YEARS = 60;

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_PATTERN =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_TOKEN = String.raw`(?:${MONTH_PATTERN}\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})`;
const PRESENT_TOKEN = '(?:Present|Current|Now|Ongoing)';

const EXPLICIT_YEARS_PATTERN = /(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)\b(\s+of\s+experience)?/gi;
const RANGE_PATTERN = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN}|${PRESENT_TOKEN})`,
  'gi',
);
const PRESENT_ONLY = new RegExp(`^${PRESENT_TOKEN}$`, 'i');

interface ParsedDate {
  readonly year: number;
  readonly month: number;
}

function parseDateToken(token: string): ParsedDate | null {
  const trimmed = token.trim();

  const monthYear = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(trimmed);
  if (monthYear !== null) {
    const rawMonth = monthYear[1];
    const rawYear = monthYear[2];
    const month = rawMonth !== undefined ? MONTH_NAMES[rawMonth.toLowerCase()] : undefined;
    const year = rawYear !== undefined ? Number(rawYear) : Number.NaN;
    return month !== undefined && Number.isFinite(year) ? { year, month } : null;
  }

  const numericMonthYear = /^(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (numericMonthYear !== null) {
    const month = Number(numericMonthYear[1]);
    const year = Number(numericMonthYear[2]);
    return month >= 1 && month <= 12 ? { year, month } : null;
  }

  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly !== null) {
    const rawYear = yearOnly[1];
    return rawYear !== undefined ? { year: Number(rawYear), month: 1 } : null;
  }

  return null;
}

function overlapsAny(
  start: number,
  end: number,
  ranges: readonly { start: number; end: number }[],
): boolean {
  return ranges.some((r) => start < r.end && end > r.start);
}

/**
 * Date-range parsing for years of experience (Section 2 technique).
 *
 * Two rule-based signals are combined:
 *  1. Explicit statements ("5+ years of experience") — high confidence,
 *     scanned everywhere in the text.
 *  2. Employment date ranges ("Jan 2019 - Mar 2022", "2019 - Present") —
 *     lower confidence, since a date range alone does not prove it was
 *     paid, relevant, full-time work. Ranges inside a detected Education or
 *     Certifications section are excluded so schooling dates are never
 *     counted as experience.
 *
 * "Present"/"Current" is resolved against the caller-supplied
 * `referenceDate` rather than a wall-clock read (Section 6.6: no `Date` in
 * `packages/core`).
 */
export function extractYearsExperience(
  text: string,
  referenceDate: ExtractionOptions['referenceDate'],
): readonly YearsExperienceAttribute[] {
  if (text.length === 0) return [];

  const results: YearsExperienceAttribute[] = [];

  const excludedRanges = detectSections(text)
    .filter((s) => s.name === 'education' || s.name === 'certifications')
    .map((s) => ({ start: s.start, end: s.end }));

  const explicitPattern = new RegExp(EXPLICIT_YEARS_PATTERN);
  let explicitMatch: RegExpExecArray | null;
  while ((explicitMatch = explicitPattern.exec(text)) !== null) {
    const numberText = explicitMatch[1];
    if (numberText === undefined) continue;
    const parsed = Number(numberText);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_PLAUSIBLE_YEARS) continue;

    const hasOfExperience = explicitMatch[2] !== undefined;
    const confidence = quantize(
      Math.min(1, EXPLICIT_BASE_CONFIDENCE + (hasOfExperience ? EXPLICIT_OF_EXPERIENCE_BONUS : 0)),
    );
    const start = explicitMatch.index;
    const end = start + explicitMatch[0].length;
    const value = text.slice(start, end);
    const years = quantize(parsed);
    const sourceSpan = { start, end };
    assertValidSpan(text, sourceSpan, value);

    results.push({
      kind: 'years_experience',
      value,
      normalizedValue: String(years),
      confidence,
      sourceSpan,
      years,
    });
  }

  const rangePattern = new RegExp(RANGE_PATTERN);
  let rangeMatch: RegExpExecArray | null;
  while ((rangeMatch = rangePattern.exec(text)) !== null) {
    const startText = rangeMatch[1];
    const endText = rangeMatch[2];
    if (startText === undefined || endText === undefined) continue;

    const matchStart = rangeMatch.index;
    const matchEnd = matchStart + rangeMatch[0].length;
    if (overlapsAny(matchStart, matchEnd, excludedRanges)) continue;

    const start = parseDateToken(startText);
    const end = PRESENT_ONLY.test(endText) ? referenceDate : parseDateToken(endText);
    if (start === null || end === null) continue;

    const months = (end.year - start.year) * 12 + (end.month - start.month);
    if (months <= 0) continue;

    const years = roundHalfUp(months / 12, 1);
    if (years <= 0 || years > MAX_PLAUSIBLE_YEARS) continue;

    const value = text.slice(matchStart, matchEnd);
    const sourceSpan = { start: matchStart, end: matchEnd };
    assertValidSpan(text, sourceSpan, value);

    results.push({
      kind: 'years_experience',
      value,
      normalizedValue: String(years),
      confidence: DATE_RANGE_CONFIDENCE,
      sourceSpan,
      years,
    });
  }

  return results.sort(
    (a, b) => a.sourceSpan.start - b.sourceSpan.start || a.sourceSpan.end - b.sourceSpan.end,
  );
}
