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
 * **H-095 (closes the "two-part dotted form" gap left open above, and its
 * dash/year-first siblings).** `numericMonthYear`'s two-part branch used to
 * be slash-only (`\d{1,2}\/\d{4}`), so `03.2019 - Present` and
 * `03-2019 - Present` fell through to the bare `\d{4}` alternative,
 * defaulting to January and OVER-counting by however many months into the
 * year the true start date was — and `2015/03 - Present` /
 * `2015-03 - Present` (year-first order) fell through to bare-year on BOTH
 * ends, matching nothing and DELETING the role.
 *
 * `TWO_PART_DATE_TOKEN` now accepts `.`/`-` alongside `/`, and both
 * `MM[sep]YYYY` and `YYYY[sep]MM` orders. **No ambiguity machinery is
 * needed here** (unlike the three-part case): a 4-digit group is
 * unambiguously the year wherever it sits, so which side is the month is
 * never in doubt. The one thing to guard is not swallowing an ordinary bare
 * `YYYY - YYYY` range or a decimal/version-like number — both alternatives
 * require the OTHER side to be a 1-2 digit number immediately adjacent (no
 * space) with a valid 1-12 month value, which a version string like `12.4`
 * or a spaced range like `2015 - 2019` does not present.
 */
const THREE_PART_DATE_TOKEN = String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{4}`;
const THREE_PART_DATE_SHAPE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const TWO_PART_DATE_TOKEN = String.raw`\d{1,2}[/.-]\d{4}|\d{4}[/.-]\d{1,2}`;

const DATE_TOKEN = String.raw`(?:${MONTH_PATTERN}\.?\s+\d{4}|${THREE_PART_DATE_TOKEN}|${TWO_PART_DATE_TOKEN}|\d{4})`;
const PRESENT_TOKEN = '(?:Present|Current|Now|Ongoing)';

/**
 * H-103: a bare `N years?`/`yrs?` match needs no experience context
 * whatsoever, so "Maintained a 15 year old legacy COBOL system" reads as a
 * 15-year tenure claim — a SYSTEM's age becomes a PERSON's tenure, and
 * `explain.ts` shows the recruiter the literal span "15 year" as proof.
 * "N year partnership/contract/warranty/lease" is the same shape with a
 * different noun.
 *
 * The discriminator is GRAMMATICAL, not lexical. English uses the SINGULAR
 * attributively — "a 15 year old system", "a 20 year partnership", "a 5 year
 * contract" — and the PLURAL for a span of time a person accumulated: "15
 * years as a registered nurse", "20 years in the trade". So a plural
 * `years`/`yrs` is a tenure claim, and a singular `year`/`yr` is one only
 * when "experience" follows it outright (which keeps "1 year of experience",
 * the low-end case, working).
 *
 * **Requiring the literal word "experience" was tried first and rejected by
 * measurement.** It killed the fabrications, and it also dropped
 * "Over 20 years in backend engineering", "15 years as a registered nurse"
 * and "A qualified electrician with 18 years in the trade" — ordinary CV
 * phrasing. That is not a fix, it is the same wrong number moved from
 * fabricated-high to silently-zero: an explicit claim is what
 * `totalYearsExperience` falls back to when no range parses, so losing it
 * shows the recruiter "found 0" for someone with twenty years. H-101 and
 * H-102 are the same silent-zero shape, being closed in this very commit.
 *
 * `years old` is excluded outright — a person's stated AGE is not tenure,
 * and ADR-007 keeps age proxies out of scoring entirely.
 *
 * Group 2 (the confidence bonus) distinguishes "of experience" from bare
 * "experience"; it no longer gates whether the phrase counts at all.
 */
const EXPLICIT_YEARS_PATTERN =
  /(\d{1,2}(?:\.\d)?)\+?\s*(?:years|yrs|(?:year|yr)(?=\s+(?:of\s+)?experience\b))\b(?!\s+old\b)(\s+of\s+experience|\s+experience)?/gi;
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
 *
 * **H-102: the window must not cross a newline.** D5c was measured only for
 * false POSITIVES ("budget of 2000 - 2024 USD", "Grew active users from
 * 2015 - 2019" — both quantity word and range on the SAME line). It was
 * never measured for false NEGATIVES: the line immediately after a CV date
 * range is almost always a metric bullet ("Scaled the platform to two
 * million users."), and D5c's quantity-word list is ordinary CV vocabulary
 * ("users", "accounts", "requests", ...). A raw character window happily
 * crosses the line break and reads that bullet as if it qualified the
 * range itself, deleting a real employment range. Every one of D5c's actual
 * positives has the quantity word on the SAME LINE as the range, so
 * clamping the window to the line loses no coverage there while no longer
 * reaching an adjacent bullet.
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

  const lineStart = text.lastIndexOf('\n', Math.max(0, matchStart - 1)) + 1;
  const nextNewline = text.indexOf('\n', matchEnd);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;

  const before = text.slice(Math.max(lineStart, matchStart - CONTEXT_WINDOW_CHARS), matchStart);
  if (NON_EMPLOYMENT_CONTEXT.test(before)) return true;

  const after = text.slice(matchEnd, Math.min(lineEnd, matchEnd + CONTEXT_WINDOW_CHARS));
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

/**
 * How a tenure figure is LABELLED. `years` itself stays the exact fraction —
 * H-104 exists because rounding per range before summing inflated totals by
 * up to 20% — but `normalizedValue` is presentation, and a recruiter reading
 * evidence should see "6.6", not "6.583333".
 *
 * Keeping the two apart is the whole point: arithmetic precision and display
 * precision are different jobs, and collapsing them is what caused H-104 in
 * the first place.
 */
const TENURE_LABEL_DECIMALS = 1;

function labelYears(years: number): string {
  return String(roundHalfUp(years, TENURE_LABEL_DECIMALS));
}

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

  // H-095: MM[sep]YYYY, any of / . -. The year is always the 4-digit side,
  // so there is nothing to disambiguate — unlike the three-part case.
  const monthThenYear = /^(\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (monthThenYear !== null) {
    const month = Number(monthThenYear[1]);
    const year = Number(monthThenYear[2]);
    return month >= 1 && month <= 12 ? { kind: 'resolved', date: { year, month } } : INVALID_DATE;
  }

  // H-095: the year-first order, YYYY[sep]MM ("2015/03", "2015-03"). Same
  // separators, same unambiguous year-by-digit-count rule.
  const yearThenMonth = /^(\d{4})[/.-](\d{1,2})$/.exec(trimmed);
  if (yearThenMonth !== null) {
    const year = Number(yearThenMonth[1]);
    const month = Number(yearThenMonth[2]);
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

/**
 * H-107: `ADR-032`'s own documented residual. Two or more ambiguous ranges
 * used to each report `computeAmbiguousLowerBoundYears` independently, and
 * the caller (`unreadableEmploymentDates`, ../scoring/dimensions.js) summed
 * them with no interval merge — so two IDENTICAL, fully-overlapping
 * concurrent ambiguous roles reported roughly DOUBLE the true minimum
 * coverage, and that inflated number could cross a must-have gate and raise
 * a BLOCKING reservation asserting a figure the document never supported.
 *
 * **The fix, and why it is sound.** Interval-merging needs absolute
 * start/end months, which only exist per LOCALE READING (an ambiguous range
 * has none on its own — that is the whole reason it is ambiguous). So this
 * merges under ONE reading applied to every ambiguous range in the document
 * — first entirely DAY-FIRST, then entirely MONTH-FIRST — producing two
 * candidate totals, and the caller keeps whichever credited-months map
 * produced the SMALLER grand total.
 *
 * That is a true lower bound PROVIDED the document uses one notation
 * consistently across its ambiguous ranges (the same assumption a single
 * ambiguous range's own two-reading minimum already leans on, generalised
 * from one range to the set): if the document's real locale is day-first,
 * the day-first merge computes the true total exactly, and
 * `min(dayFirst, monthFirst) <= dayFirst = truth` regardless of what the
 * month-first total happens to be — and symmetrically if the real locale is
 * month-first. A document that mixes notations between different ambiguous
 * ranges is the one case this does not provably bound; not observed in the
 * corpus, and disclosed rather than hidden.
 *
 * For exactly one ambiguous range this reduces to the ORIGINAL
 * `computeAmbiguousLowerBoundYears` behaviour exactly (no other range to
 * merge against), which is why the caller keeps that function for the
 * single-range case rather than routing everything through this one.
 */
function creditedMonthsUnderReading<
  T extends { readonly start: DateParseResult; readonly end: DateParseResult },
>(
  candidates: readonly T[],
  resolve: (result: DateParseResult) => ParsedDate | null,
): Map<T, number> {
  interface Interval {
    readonly candidate: T;
    readonly startAbs: number;
    readonly endAbs: number;
  }

  const intervals: Interval[] = [];
  for (const candidate of candidates) {
    const start = resolve(candidate.start);
    const end = resolve(candidate.end);
    // Cannot happen for a range that reached this point (both sides were
    // already confirmed not `invalid`), but resolved defensively rather
    // than asserted, per rule 0.2.4 (never swallow, but also never crash
    // on a case that should be structurally impossible).
    if (start === null || end === null) continue;
    intervals.push({ candidate, startAbs: toAbsoluteMonth(start), endAbs: toAbsoluteMonth(end) });
  }

  const chronological = intervals
    .slice()
    .sort((a, b) => a.startAbs - b.startAbs || a.endAbs - b.endAbs);
  const credited = new Map<T, number>();
  let coveredUntil = -Infinity;
  for (const interval of chronological) {
    const creditedStart = Math.max(interval.startAbs, coveredUntil);
    credited.set(interval.candidate, Math.max(0, interval.endAbs - creditedStart));
    coveredUntil = Math.max(coveredUntil, interval.endAbs);
  }
  return credited;
}

function sumValues(map: ReadonlyMap<unknown, number>): number {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
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

    // Group 2 is now mandatory (H-103: "experience" must follow at all) and
    // captures either " of experience" or bare " experience" — the bonus
    // still distinguishes the two, it no longer gates whether this is an
    // experience claim in the first place.
    const hasOfExperience = explicitMatch[2]?.trim().toLowerCase().startsWith('of') === true;
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
      normalizedValue: labelYears(years),
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

  // H-107: an AMBIGUOUS range's attribute is not emitted immediately — it is
  // deferred (like `RangeCandidate` above) so that, when MORE THAN ONE
  // ambiguous range exists in the document, they can be interval-merged
  // before a `minPossibleYears` is assigned. See the processing step below
  // the main loop for why.
  interface AmbiguousRangeCandidate {
    readonly matchStart: number;
    readonly matchEnd: number;
    readonly value: string;
    readonly start: DateParseResult;
    readonly end: DateParseResult;
  }

  const candidates: RangeCandidate[] = [];
  const ambiguousCandidates: AmbiguousRangeCandidate[] = [];
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
      const value = text.slice(matchStart, matchEnd);
      assertValidSpan(text, { start: matchStart, end: matchEnd }, value);
      ambiguousCandidates.push({ matchStart, matchEnd, value, start: startResult, end: endResult });
      continue;
    }

    const start = startResult.date;
    // H-101: a START in the future makes the whole range implausible — a CV
    // does not narrate employment that has not begun (`Jan 2030 - Jan 2032`
    // must still be rejected; the far-future guard). But a range that
    // STARTED in the past and merely ENDS after `referenceDate` is an
    // ordinary current fixed-term contract ("Jan 2015 - Dec 2026" against a
    // stored reference date of Aug 2026) — deleting the entire role over 4
    // months of not-yet-elapsed time silently erased 11.6 years of real,
    // verifiable employment. Clamped to `referenceDate` instead, exactly
    // like "Present" already is: the engine CAN compute a definite number
    // here (it is not the E3 "unaccounted-for evidence" case — the exact
    // target end date is known, only its relationship to `referenceDate`
    // needed deciding), so ADR-029 Decision 1 favours using it over
    // dropping the range or merely flagging it unread.
    if (isFutureDate(start, referenceDate)) continue;
    const end = isFutureDate(endResult.date, referenceDate) ? referenceDate : endResult.date;

    const months = toAbsoluteMonth(end) - toAbsoluteMonth(start);
    if (months <= 0) continue;

    // H-104: do NOT round here beyond ordinary float precision. Rounding
    // EACH range to 1dp before summing (`totalYearsExperience`,
    // ../scoring/dimensions.js) was a systematic bias: a 3-month range
    // (0.25y) rounded up to 0.3, and the error compounded with range count
    // — 17 such contracts reported 5.1 instead of the true 4.25, a
    // proportional +20% unbounded by any single "0.1 quantization" story.
    // Credited months are carried as an exact fraction and rounded exactly
    // ONCE, downstream, when the total is summed.
    const years = quantize(months / 12);
    if (years <= 0 || years > MAX_PLAUSIBLE_YEARS) continue;

    candidates.push({
      matchStart,
      matchEnd,
      value: text.slice(matchStart, matchEnd),
      startAbs: toAbsoluteMonth(start),
      endAbs: toAbsoluteMonth(end),
    });
  }

  // --- Ambiguous-range pass (H-107): a lone ambiguous range keeps EXACTLY
  // the original per-range computation (`computeAmbiguousLowerBoundYears`,
  // ADR-032) — min of its own two locale readings, rounded once to 1dp.
  // TWO OR MORE ambiguous ranges are interval-merged first, under a
  // consistent locale reading, so a CONCURRENT pair is not double-counted.
  // See `creditedMonthsUnderReading` below for the soundness argument.
  if (ambiguousCandidates.length === 1) {
    const only = ambiguousCandidates[0];
    if (only !== undefined) {
      const minPossibleYears = computeAmbiguousLowerBoundYears(only.start, only.end);
      results.push({
        kind: 'unreadable_date_range',
        value: only.value,
        normalizedValue: labelYears(minPossibleYears),
        confidence: DATE_RANGE_CONFIDENCE,
        sourceSpan: { start: only.matchStart, end: only.matchEnd },
        minPossibleYears,
      });
    }
  } else if (ambiguousCandidates.length > 1) {
    // Every reading is well-defined here: both endpoints were already
    // confirmed not `invalid` above, so `resolveAsDayFirst`/
    // `resolveAsMonthFirst` cannot return null for either side.
    const dayFirstMonths = creditedMonthsUnderReading(ambiguousCandidates, resolveAsDayFirst);
    const monthFirstMonths = creditedMonthsUnderReading(ambiguousCandidates, resolveAsMonthFirst);
    const totalDayFirst = sumValues(dayFirstMonths);
    const totalMonthFirst = sumValues(monthFirstMonths);
    const winningMonths = totalDayFirst <= totalMonthFirst ? dayFirstMonths : monthFirstMonths;

    for (const candidate of ambiguousCandidates) {
      const months = winningMonths.get(candidate) ?? 0;
      // H-104's lesson applied here too: quantize once, do not round each
      // range to 1dp before the caller (`unreadableEmploymentDates`,
      // ../scoring/dimensions.js) sums them.
      const minPossibleYears = quantize(months / 12);
      results.push({
        kind: 'unreadable_date_range',
        value: candidate.value,
        normalizedValue: labelYears(minPossibleYears),
        confidence: DATE_RANGE_CONFIDENCE,
        sourceSpan: { start: candidate.matchStart, end: candidate.matchEnd },
        minPossibleYears,
      });
    }
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
    // H-104: round once, not per range — see the comment at the Pass 1
    // plausibility check above for why. `totalYearsExperience`
    // (../scoring/dimensions.js) is where the single rounding happens now.
    const years = quantize(months / 12);
    // Fully absorbed by an earlier-processed, wider-covering range.
    if (years <= 0) continue;

    const sourceSpan = { start: candidate.matchStart, end: candidate.matchEnd };
    assertValidSpan(text, sourceSpan, candidate.value);

    results.push({
      kind: 'years_experience',
      value: candidate.value,
      normalizedValue: labelYears(years),
      confidence: DATE_RANGE_CONFIDENCE,
      sourceSpan,
      years,
    });
  }

  return results.sort(
    (a, b) => a.sourceSpan.start - b.sourceSpan.start || a.sourceSpan.end - b.sourceSpan.end,
  );
}
