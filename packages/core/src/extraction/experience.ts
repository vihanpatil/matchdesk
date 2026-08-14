import { quantize, roundHalfUp } from '../numeric/round.js';
import { extractIgnoringInvisibleCharacters } from './invisible.js';
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

/**
 * A two-digit number outside 1-12 can only ever be a DAY, never a month —
 * true in every locale. That is the ONE fact that makes any part of a
 * numeric `NN/NN/YYYY` or `NN-NN-YYYY` date unambiguous (B.4, H-040's shape
 * for Indian/European date formats): whichever of the two leading numbers
 * falls in 13-31 is the day, and the OTHER number must then be the month,
 * regardless of which side it is written on. `13/04/2019` is unambiguously
 * 13 April (DD/MM/YYYY, the Indian/European convention) and `04/13/2019` is
 * unambiguously 13 April also (MM/DD/YYYY, the US convention) — both read
 * to month 4.
 *
 * When BOTH leading numbers are 1-12 (`03/04/2019`), the format is genuinely
 * ambiguous between DD/MM/YYYY and MM/DD/YYYY, and this pattern is built to
 * match ONLY the unambiguous shape, so the ambiguous shape never reaches
 * `parseDateToken` as a 3-part token.
 *
 * ⚠ **DO NOT read that as "the ambiguous case is left unresolved".** An
 * earlier version of this comment claimed exactly that, and an independent
 * verifier falsified it (H-094). What actually happens is worse, because the
 * ambiguous token falls through to the alternatives BELOW, which match a
 * SUBSTRING of it:
 *
 *   `03/04/2019 - Present`  -> `04/2019 - Present`  (leading `03/` discarded)
 *   `04/03/2013 - Present`  -> `03/2013 - Present`  (reads MARCH — a US-form
 *                                                    date silently read DD/MM)
 *   `03-04-2013 - Present`  -> `2013 - Present`     (dash misses the
 *                                                    slash-only alternative
 *                                                    and defaults to January)
 *
 * So the engine DOES commit to a locale — accidentally, via a fallback,
 * rather than deliberately — and it truncates the recruiter-visible evidence
 * span while doing so. Two-sided ranges are governed by the END date and are
 * dropped entirely, deleting the role.
 *
 * These are tracked as H-089 (silent deletion / under-count) and H-095
 * (silent over-count). **Both are open wrong-score findings. Do not "tidy"
 * this comment back into a claim of safety.**
 */
const UNAMBIGUOUS_DAY_NUMBER = '(?:1[3-9]|2[0-9]|3[01])';
const THREE_PART_UNAMBIGUOUS_DATE = `(?:${UNAMBIGUOUS_DAY_NUMBER}[\\/\\-]\\d{1,2}|\\d{1,2}[\\/\\-]${UNAMBIGUOUS_DAY_NUMBER})[\\/\\-]\\d{4}`;
const THREE_PART_DATE_SHAPE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

const DATE_TOKEN = String.raw`(?:${MONTH_PATTERN}\.?\s+\d{4}|${THREE_PART_UNAMBIGUOUS_DATE}|\d{1,2}\/\d{4}|\d{4})`;
const PRESENT_TOKEN = '(?:Present|Current|Now|Ongoing)';

const EXPLICIT_YEARS_PATTERN = /(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)\b(\s+of\s+experience)?/gi;
const RANGE_PATTERN = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN}|${PRESENT_TOKEN})`,
  'gi',
);
const PRESENT_ONLY = new RegExp(`^${PRESENT_TOKEN}$`, 'i');
const YEAR_ONLY = /^\d{4}$/;

/**
 * Words that, found near a BARE `YYYY - YYYY` range, indicate the range is a
 * quantity (a budget, a user count, a growth metric, ...) rather than an
 * employment date range (H-028 D5c: "budget of 2000 - 2024 USD", "Grew
 * active users from 2015 - 2019"). A range with month names ("Jan 2019 -
 * Mar 2022") is unambiguous and is never subject to this check — only a
 * bare four-digit-year range is ambiguous enough to need it.
 */
const NON_EMPLOYMENT_CONTEXT =
  /\b(?:budget|users?|revenue|sales|population|customers?|subscribers?|followers?|downloads?|requests?|transactions?|records?|dollars?|usd|gbp|eur|cad|aud|points?|score|rating|impressions?|visitors?|clicks?|views?|installs?|accounts?|licen[cs]es?|percent|shares?|units?)\b/i;

/** How far to look for disqualifying context around a bare year range. */
const CONTEXT_WINDOW_CHARS = 40;

interface ParsedDate {
  readonly year: number;
  readonly month: number;
}

/** Absolute month index (year * 12 + month), for interval arithmetic. */
function toAbsoluteMonth(date: ParsedDate): number {
  return date.year * 12 + date.month;
}

function isFutureDate(
  date: ParsedDate,
  referenceDate: ExtractionOptions['referenceDate'],
): boolean {
  return toAbsoluteMonth(date) > toAbsoluteMonth(referenceDate);
}

/**
 * A bare `YYYY - YYYY` range needs supporting context to count as
 * employment (H-028 D5c). Rejects it when a quantity word appears
 * immediately before the match or as the token immediately after it.
 */
function isBareRangeWithoutEmploymentContext(
  text: string,
  startText: string,
  endText: string,
  matchStart: number,
  matchEnd: number,
): boolean {
  if (!YEAR_ONLY.test(startText.trim())) return false;
  if (!YEAR_ONLY.test(endText.trim()) && !PRESENT_ONLY.test(endText.trim())) return false;

  const before = text.slice(Math.max(0, matchStart - CONTEXT_WINDOW_CHARS), matchStart);
  if (NON_EMPLOYMENT_CONTEXT.test(before)) return true;

  const after = text.slice(matchEnd, matchEnd + CONTEXT_WINDOW_CHARS);
  return NON_EMPLOYMENT_CONTEXT.test(after);
}

function parseDateToken(token: string): ParsedDate | null {
  const trimmed = token.trim();

  // Unambiguous DD/MM/YYYY or MM/DD/YYYY (B.4): only reached when the token
  // matched THREE_PART_UNAMBIGUOUS_DATE above, which structurally requires
  // one of the two leading numbers to be 13-31. Re-parsing generically here
  // (rather than trusting alternation branch) keeps the day-vs-month choice
  // in one place. The day value itself is never used — this module tracks
  // only year and month, never day-of-month.
  const threePart = THREE_PART_DATE_SHAPE.exec(trimmed);
  if (threePart !== null) {
    const first = threePart[1];
    const second = threePart[2];
    const rawYear = threePart[3];
    if (first === undefined || second === undefined || rawYear === undefined) return null;
    const d1 = Number(first);
    const d2 = Number(second);
    const year = Number(rawYear);
    // Exactly one side must be an unambiguous day (13-31) for this branch to
    // have matched at all; whichever side is NOT that is the month. If both
    // sides ended up >12 (e.g. "13/25/2019") the month candidate is invalid
    // and this correctly falls through to null below.
    const month = d1 > 12 ? d2 : d1;
    return month >= 1 && month <= 12 && Number.isFinite(year) ? { year, month } : null;
  }

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
 *     scanned everywhere in the text, flagged `isExplicitStatement: true` so
 *     `totalYearsExperience` (../scoring/dimensions.js) can treat them as
 *     corroboration rather than an addend when date ranges are also present
 *     (H-028 D5b).
 *  2. Employment date ranges ("Jan 2019 - Mar 2022", "2019 - Present") —
 *     lower confidence, since a date range alone does not prove it was
 *     paid, relevant, full-time work. Ranges inside a detected Education or
 *     Certifications section are excluded so schooling dates are never
 *     counted as experience. Overlapping ranges (concurrent roles) are
 *     merged so the covered months are credited once, not once per role
 *     (H-028 D5b). A BARE `YYYY - YYYY` range additionally needs an absence
 *     of quantity-shaped context ("budget of ...", "users from ...") to
 *     count at all (H-028 D5c), and any range touching the future relative
 *     to `referenceDate` is rejected outright as implausible.
 *
 * "Present"/"Current" is resolved against the caller-supplied
 * `referenceDate` rather than a wall-clock read (Section 6.6: no `Date` in
 * `packages/core`).
 */
export function extractYearsExperience(
  text: string,
  referenceDate: ExtractionOptions['referenceDate'],
): readonly YearsExperienceAttribute[] {
  return extractIgnoringInvisibleCharacters(text, (visible) =>
    extractYearsExperienceFromVisibleText(visible, referenceDate),
  );
}

function extractYearsExperienceFromVisibleText(
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
      isExplicitStatement: true,
    });
  }

  // --- Pass 1: collect every plausible, in-bounds, non-excluded date range.
  interface RangeCandidate {
    readonly matchStart: number;
    readonly matchEnd: number;
    readonly value: string;
    readonly startAbs: number;
    readonly endAbs: number;
  }

  const candidates: RangeCandidate[] = [];
  const rangePattern = new RegExp(RANGE_PATTERN);
  let rangeMatch: RegExpExecArray | null;
  while ((rangeMatch = rangePattern.exec(text)) !== null) {
    const startText = rangeMatch[1];
    const endText = rangeMatch[2];
    if (startText === undefined || endText === undefined) continue;

    const matchStart = rangeMatch.index;
    const matchEnd = matchStart + rangeMatch[0].length;
    if (overlapsAny(matchStart, matchEnd, excludedRanges)) continue;
    if (isBareRangeWithoutEmploymentContext(text, startText, endText, matchStart, matchEnd)) {
      continue;
    }

    const start = parseDateToken(startText);
    const end = PRESENT_ONLY.test(endText) ? referenceDate : parseDateToken(endText);
    if (start === null || end === null) continue;
    if (isFutureDate(start, referenceDate) || isFutureDate(end, referenceDate)) continue;

    const months = toAbsoluteMonth(end) - toAbsoluteMonth(start);
    if (months <= 0) continue;

    const years = roundHalfUp(months / 12, 1);
    if (years <= 0 || years > MAX_PLAUSIBLE_YEARS) continue;

    candidates.push({
      matchStart,
      matchEnd,
      value: text.slice(matchStart, matchEnd),
      startAbs: toAbsoluteMonth(start),
      endAbs: toAbsoluteMonth(end),
    });
  }

  // --- Pass 2: merge overlapping intervals (H-028 D5b) so a candidate with
  // two concurrent roles is credited for the union of months worked, not
  // the sum of each role's individual duration. Processed in chronological
  // (start-date) order regardless of where each range appears in the text,
  // then re-emitted in original text order so evidence spans stay stable.
  const chronological = candidates
    .slice()
    .sort((a, b) => a.startAbs - b.startAbs || a.endAbs - b.endAbs);
  const creditedMonths = new Map<RangeCandidate, number>();
  let coveredUntil = -Infinity;
  for (const candidate of chronological) {
    const creditedStart = Math.max(candidate.startAbs, coveredUntil);
    creditedMonths.set(candidate, Math.max(0, candidate.endAbs - creditedStart));
    coveredUntil = Math.max(coveredUntil, candidate.endAbs);
  }

  for (const candidate of candidates) {
    const months = creditedMonths.get(candidate) ?? 0;
    const years = roundHalfUp(months / 12, 1);
    // Fully absorbed by an earlier-processed, wider-covering range.
    if (years <= 0) continue;

    const sourceSpan = { start: candidate.matchStart, end: candidate.matchEnd };
    assertValidSpan(text, sourceSpan, candidate.value);

    results.push({
      kind: 'years_experience',
      value: candidate.value,
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
