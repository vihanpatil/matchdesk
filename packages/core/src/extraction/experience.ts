import { quantize, roundHalfUp } from '../numeric/round.js';
import { extractIgnoringInvisibleCharacters } from './invisible.js';
import { assertValidSpan } from './span.js';
import { detectSections } from './sections.js';
import type {
  ExtractionOptions,
  UnreadableDateRangeAttribute,
  YearsExperienceAttribute,
} from './types.js';

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
 * E1/E2/E3 (docs/NEXT_PHASE.md Task E, ADR-029, closing H-089/H-095).
 *
 * **E1 — consume the whole token, always.** `THREE_PART_DATE_TOKEN` matches
 * ANY `NN[sep]NN[sep]YYYY` with `sep` in `/ - .`, regardless of whether the
 * two leading numbers are resolvable. It sits in `DATE_TOKEN`'s alternation
 * BEFORE the two-part `\d{1,2}\/\d{4}` and bare `\d{4}` branches, so it
 * always wins and a three-part date is never left for a shorter alternative
 * to match a SUBSTRING of it. That substring fallback was the actual
 * mechanism behind both H-089 and H-095 (an independent verifier's
 * correction, H-094):
 *
 *   `03/04/2019 - Present`  -> was `04/2019 - Present`  (leading `03/` lost)
 *   `04/03/2013 - Present`  -> was `03/2013 - Present`  (silently read DD/MM)
 *   `03-04-2013 - Present`  -> was `2013 - Present`     (dash missed the
 *                                                        slash-only 2-part
 *                                                        branch, defaulted
 *                                                        to January)
 *
 * All three now match the full three-part token and reach `parseDateToken`
 * intact — no truncated evidence span is possible any more.
 *
 * **E2 — classify, never guess.** A two-digit number outside 1-12 can only
 * ever be a DAY, never a month, in every locale. `parseDateToken` uses that
 * to sort every three-part date into exactly one of three outcomes:
 *
 *   1. Exactly one of the two leading numbers is 13-31 -> RESOLVED. The
 *      other number is the month, whichever side it is written on:
 *      `13/04/2019` and `04/13/2019` both read April 2019 (B.4).
 *   2. BOTH leading numbers are 1-12 (`03/04/2019`) -> AMBIGUOUS. Genuinely
 *      undecidable between DD/MM (right for this project's Indian clients)
 *      and MM/DD (right for a US CV), with no way to tell which the
 *      document holds. **This module does not pick one** — that would be
 *      exactly the accidental-locale bug above, only deliberate instead of
 *      a fallback artefact.
 *   3. Both leading numbers are 13-31 (`13/25/2019`) -> INVALID. Neither
 *      can be a month; this is a malformed date, not an ambiguous one, and
 *      is dropped exactly as before.
 *
 * **E3 — surface the ambiguity, never delete the role.** An AMBIGUOUS
 * range does not become a `YearsExperienceAttribute` — there is no locale
 * to compute one from — and it does not simply vanish either (that
 * reproduces H-089). It becomes an `UnreadableDateRangeAttribute`
 * (`./types.js`) instead: the engine's on-the-record admission that an
 * employment range was present and could not be read. `scoreCandidate`
 * turns this into a `Reservation` (ADR-029) rather than a silently smaller
 * or larger number.
 *
 * **Deliberately still out of scope: the two-part dotted form `03.2006`**
 * (H-040's original gap). `numericMonthYear` below stays slash-only, so a
 * bare `MM.YYYY` still falls through to the bare-year branch. Not touched
 * by this change.
 */
const THREE_PART_DATE_TOKEN = String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{4}`;
const THREE_PART_DATE_SHAPE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

const DATE_TOKEN = String.raw`(?:${MONTH_PATTERN}\.?\s+\d{4}|${THREE_PART_DATE_TOKEN}|\d{1,2}\/\d{4}|\d{4})`;
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

/**
 * E2's three-way classification. `resolved` and `invalid` behave exactly
 * like the old `ParsedDate | null` return did; `ambiguous` is new — it
 * carries the raw leading numbers so the caller (E3) can compute a
 * lower-bound duration under both possible locale readings without
 * re-parsing the token.
 */
type DateParseResult =
  | { readonly kind: 'resolved'; readonly date: ParsedDate }
  | { readonly kind: 'ambiguous'; readonly d1: number; readonly d2: number; readonly year: number }
  | { readonly kind: 'invalid' };

const INVALID_DATE: DateParseResult = { kind: 'invalid' };

function parseDateToken(token: string): DateParseResult {
  const trimmed = token.trim();

  // Three-part numeric date (E1/E2): reached whenever the token matched
  // THREE_PART_DATE_TOKEN above, which now accepts ANY two 1-2 digit
  // numbers regardless of value — the range-vs-month decision happens only
  // here, in one place, so it can be classified rather than guessed. The
  // day value itself is never used for a RESOLVED date — this module
  // tracks only year and month, never day-of-month.
  const threePart = THREE_PART_DATE_SHAPE.exec(trimmed);
  if (threePart !== null) {
    const first = threePart[1];
    const second = threePart[2];
    const rawYear = threePart[3];
    if (first === undefined || second === undefined || rawYear === undefined) {
      return INVALID_DATE;
    }
    const d1 = Number(first);
    const d2 = Number(second);
    const year = Number(rawYear);
    if (!Number.isFinite(year)) return INVALID_DATE;

    const d1IsUnambiguousDay = d1 >= 13 && d1 <= 31;
    const d2IsUnambiguousDay = d2 >= 13 && d2 <= 31;

    // Exactly one side is an unambiguous day (13-31, impossible as a month
    // in any locale) -> RESOLVED. The other side is the month, whichever
    // side it is written on (B.4).
    if (d1IsUnambiguousDay && !d2IsUnambiguousDay) {
      return d2 >= 1 && d2 <= 12 ? { kind: 'resolved', date: { year, month: d2 } } : INVALID_DATE;
    }
    if (d2IsUnambiguousDay && !d1IsUnambiguousDay) {
      return d1 >= 1 && d1 <= 12 ? { kind: 'resolved', date: { year, month: d1 } } : INVALID_DATE;
    }
    // Both <=12 -> AMBIGUOUS (E2): genuinely undecidable between DD/MM and
    // MM/DD. Refuse to resolve; the caller surfaces this rather than
    // silently picking a locale.
    if (!d1IsUnambiguousDay && !d2IsUnambiguousDay) {
      return { kind: 'ambiguous', d1, d2, year };
    }
    // Both 13-31 (e.g. "13/25/2019") -> INVALID. Neither can be a month.
    return INVALID_DATE;
  }

  const monthYear = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(trimmed);
  if (monthYear !== null) {
    const rawMonth = monthYear[1];
    const rawYear = monthYear[2];
    const month = rawMonth !== undefined ? MONTH_NAMES[rawMonth.toLowerCase()] : undefined;
    const year = rawYear !== undefined ? Number(rawYear) : Number.NaN;
    return month !== undefined && Number.isFinite(year)
      ? { kind: 'resolved', date: { year, month } }
      : INVALID_DATE;
  }

  // Slash-only, deliberately: the two-part dotted form ("03.2006", H-040's
  // original gap) stays unreached here and falls through to the bare-year
  // branch below, exactly as before. Out of scope for this change — see
  // the module doc comment above DATE_TOKEN.
  const numericMonthYear = /^(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (numericMonthYear !== null) {
    const month = Number(numericMonthYear[1]);
    const year = Number(numericMonthYear[2]);
    return month >= 1 && month <= 12 ? { kind: 'resolved', date: { year, month } } : INVALID_DATE;
  }

  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly !== null) {
    const rawYear = yearOnly[1];
    return rawYear !== undefined
      ? { kind: 'resolved', date: { year: Number(rawYear), month: 1 } }
      : INVALID_DATE;
  }

  return INVALID_DATE;
}

/** The DD/MM reading of a date result: the FIRST leading number is the day,
 *  the SECOND is the month. `null` only for `invalid` (nothing to resolve). */
function resolveAsDayFirst(result: DateParseResult): ParsedDate | null {
  if (result.kind === 'resolved') return result.date;
  if (result.kind === 'ambiguous') return { year: result.year, month: result.d2 };
  return null;
}

/** The MM/DD reading: the FIRST leading number is the month. For a
 *  `resolved` date there is only one reading (the day side was already
 *  identified as 13-31), so both readings agree — as they must. */
function resolveAsMonthFirst(result: DateParseResult): ParsedDate | null {
  if (result.kind === 'resolved') return result.date;
  if (result.kind === 'ambiguous') return { year: result.year, month: result.d1 };
  return null;
}

/**
 * ADR-029's "materiality is computed, not guessed", applied to an unreadable
 * range (E3). Resolves the WHOLE range two ways — every ambiguous token read
 * as DD/MM, then every ambiguous token read as MM/DD — computes the duration
 * each way, and returns the SMALLER one. That number is true under either
 * locale, so reporting it commits to neither. Returns 0 when neither reading
 * produces a positive duration (nothing safe to report as a lower bound).
 */
function computeAmbiguousLowerBoundYears(start: DateParseResult, end: DateParseResult): number {
  const readings: number[] = [];

  const dayFirstStart = resolveAsDayFirst(start);
  const dayFirstEnd = resolveAsDayFirst(end);
  if (dayFirstStart !== null && dayFirstEnd !== null) {
    const months = toAbsoluteMonth(dayFirstEnd) - toAbsoluteMonth(dayFirstStart);
    if (months > 0) readings.push(months);
  }

  const monthFirstStart = resolveAsMonthFirst(start);
  const monthFirstEnd = resolveAsMonthFirst(end);
  if (monthFirstStart !== null && monthFirstEnd !== null) {
    const months = toAbsoluteMonth(monthFirstEnd) - toAbsoluteMonth(monthFirstStart);
    if (months > 0) readings.push(months);
  }

  if (readings.length === 0) return 0;
  return roundHalfUp(Math.min(...readings) / 12, 1);
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
): readonly (YearsExperienceAttribute | UnreadableDateRangeAttribute)[] {
  return extractIgnoringInvisibleCharacters(text, (visible) =>
    extractYearsExperienceFromVisibleText(visible, referenceDate),
  );
}

function extractYearsExperienceFromVisibleText(
  text: string,
  referenceDate: ExtractionOptions['referenceDate'],
): readonly (YearsExperienceAttribute | UnreadableDateRangeAttribute)[] {
  if (text.length === 0) return [];

  const results: (YearsExperienceAttribute | UnreadableDateRangeAttribute)[] = [];

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

    const startResult = parseDateToken(startText);
    const endResult: DateParseResult = PRESENT_ONLY.test(endText)
      ? { kind: 'resolved', date: referenceDate }
      : parseDateToken(endText);

    // INVALID (malformed, e.g. "13/25/2019"): not a date at all. Silently
    // dropped, exactly as before this change.
    if (startResult.kind === 'invalid' || endResult.kind === 'invalid') continue;

    // AMBIGUOUS (E2/E3): the END date governs just as much as the START
    // (H-094 correction 2) — either side failing to resolve makes the whole
    // range unreadable, because a duration needs BOTH endpoints. Surfaced as
    // its own attribute rather than silently dropped (H-089) or silently
    // resolved to one locale (H-095).
    if (startResult.kind === 'ambiguous' || endResult.kind === 'ambiguous') {
      const sourceSpan = { start: matchStart, end: matchEnd };
      const value = text.slice(matchStart, matchEnd);
      assertValidSpan(text, sourceSpan, value);
      const minPossibleYears = computeAmbiguousLowerBoundYears(startResult, endResult);

      results.push({
        kind: 'unreadable_date_range',
        value,
        normalizedValue: String(minPossibleYears),
        confidence: DATE_RANGE_CONFIDENCE,
        sourceSpan,
        minPossibleYears,
      });
      continue;
    }

    const start = startResult.date;
    const end = endResult.date;
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
