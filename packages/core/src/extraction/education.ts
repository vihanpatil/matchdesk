import { assertValidSpan } from './span.js';
import type { DegreeLevel, EducationAttribute } from './types.js';

const CONFIDENCE = 0.85;

/**
 * Degree-level keyword patterns, most-specific first. Deliberately contains
 * NO year pattern anywhere in this file and NO capture of surrounding
 * "University of X" / "X Institute" text — ADR-007 is binding: institution
 * name and graduation year are never extracted, not merely unused.
 *
 * Covers both American (BS, MS, ...) and British-convention (BSc, MSc, ...)
 * abbreviations, plus a handful of others in common use (BEng, MPhil, LLB,
 * LLM, BCom, BBA, BTech/MTech, DPhil, EdD, DSc). Every separator is a
 * *literal, optional period* (`\.?`) — never an optional bare space. A bare
 * space between an initial and the next token is exactly the shape of a
 * person's name ("M Phil Jackson", "Ed D. Smith"), so allowing it would trade
 * a British-degree false negative for a name false positive. Requiring a dot
 * (or nothing) keeps "BSc", "B.Sc" and "B.Sc." matching while "M Phil" (a
 * space, no dot) and "Ed D" do not.
 */
const DEGREE_PATTERNS: readonly { readonly level: DegreeLevel; readonly pattern: RegExp }[] = [
  { level: 'professional', pattern: /\b(?:j\.?d\.?|juris doctor|m\.?d\.?)\b/gi },
  {
    level: 'doctorate',
    pattern: /\b(?:ph\.?d\.?|doctorate|doctoral degree|d\.?phil\.?|ed\.?d\.?|d\.?sc\.?)\b/gi,
  },
  {
    level: 'master',
    pattern:
      /\b(?:master'?s?(?:\s+degree)?|m\.?sc\.?|m\.?eng\.?|m\.?b\.?a\.?|m\.?phil\.?|l\.?l\.?m\.?|m\.?tech\.?|m\.?s\.?|m\.?a\.?)\b/gi,
  },
  {
    level: 'bachelor',
    pattern:
      /\b(?:bachelor'?s?(?:\s+degree)?|b\.?sc\.?|b\.?eng\.?|b\.?b\.?a\.?|b\.?com\.?|l\.?l\.?b\.?|b\.?tech\.?|b\.?s\.?|b\.?a\.?)\b/gi,
  },
  { level: 'associate', pattern: /\b(?:associate'?s?(?:\s+degree)?|a\.?a\.?|a\.?s\.?)\b/gi },
  { level: 'high_school', pattern: /\bhigh school(?:\s+diploma)?\b/gi },
];

/**
 * Bare (undotted-after-stripping) 2-letter forms that collide with something
 * far more common than a degree: MS/Microsoft, MA/Massachusetts, BS/BA as
 * plain English words or other-field initialisms, MD/Maryland or Markdown,
 * JD as a person's initials, AA/AS as "Alcoholics Anonymous"/"American
 * Airlines" or the ordinary word "as". A match whose matched text, once dots
 * are stripped, is one of these is trusted only when `hasDegreeContext`
 * finds real corroborating evidence nearby (see that function). Every other
 * pattern above (BSc, MEng, PhD, LLB, ...) is distinctive enough in its own
 * spelling to stand alone.
 */
const AMBIGUOUS_BARE_FORMS: ReadonlySet<string> = new Set([
  'ms',
  'ma',
  'bs',
  'ba',
  'md',
  'jd',
  'aa',
  'as',
]);

/** Small controlled vocabulary of fields of study — deliberately never institutions. */
const FIELD_VOCAB: readonly { readonly id: string; readonly aliases: readonly string[] }[] = [
  { id: 'computer-science', aliases: ['computer science', 'cs', 'computer engineering'] },
  { id: 'business-administration', aliases: ['business administration', 'business'] },
  { id: 'data-science', aliases: ['data science'] },
  { id: 'electrical-engineering', aliases: ['electrical engineering'] },
  { id: 'mechanical-engineering', aliases: ['mechanical engineering'] },
  { id: 'information-technology', aliases: ['information technology'] },
  { id: 'mathematics', aliases: ['mathematics', 'math'] },
  { id: 'economics', aliases: ['economics', 'econ'] },
  { id: 'finance', aliases: ['finance'] },
  { id: 'marketing', aliases: ['marketing'] },
  { id: 'psychology', aliases: ['psychology'] },
  { id: 'biology', aliases: ['biology'] },
  { id: 'chemistry', aliases: ['chemistry'] },
  { id: 'physics', aliases: ['physics'] },
];

const FIELD_CAPTURE = /\b(?:in|of)\s+([A-Za-z][A-Za-z&/\- ]{1,60})/i;
const FIELD_STOP_MARKERS = [',', '.', '\n', ' from ', ' at ', ' with ', ' - '];

function normalize(term: string): string {
  return term.toLowerCase().trim().replace(/\s+/g, ' ');
}

function canonicalizeField(rawCapture: string): string | null {
  let cut = rawCapture;
  for (const marker of FIELD_STOP_MARKERS) {
    const idx = cut.indexOf(marker);
    if (idx !== -1) cut = cut.slice(0, idx);
  }
  const normalized = normalize(cut);
  const match = FIELD_VOCAB.find((f) => f.id === normalized || f.aliases.includes(normalized));
  return match?.id ?? null;
}

const DEGREE_CONTEXT_WORD = /\bdegree\b/i;
/** A field name stated with no "in"/"of" between it and the abbreviation, e.g. "BSc Computer Science". */
const DIRECT_FIELD_ADJACENT = /^[^A-Za-z]{0,3}([A-Za-z][A-Za-z&/\- ]{1,60})/;
const CONTEXT_WINDOW = 80;

/**
 * Guard for the AMBIGUOUS_BARE_FORMS set. A bare "MS"/"BA"/"MD"/... is only
 * trusted as a degree when the surrounding text corroborates it: either the
 * word "degree" nearby, or a recognized field of study stated right after it
 * (with or without a leading "in"/"of"). This is deliberately the *same*
 * FIELD_VOCAB whitelist the field-extraction path already uses, so it never
 * grows a second, inconsistent notion of "looks like a field" — and it is
 * exactly what lets "BS in Computer Science" through while rejecting
 * "MS Office" or "MS Azure" (neither Office nor Azure is a recognized field)
 * and "Baltimore, MD" (nothing field-shaped follows at all). It does not
 * (and structurally cannot) capture an institution or a year — it only ever
 * feeds a boolean back into whether the *level* match is kept.
 */
function hasDegreeContext(text: string, start: number, end: number): boolean {
  const lineStart = (() => {
    const nl = text.lastIndexOf('\n', start - 1);
    return nl === -1 ? 0 : nl + 1;
  })();
  const lineEnd = (() => {
    const nl = text.indexOf('\n', end);
    return nl === -1 ? text.length : nl;
  })();

  const before = text.slice(Math.max(lineStart, start - CONTEXT_WINDOW), start);
  const after = text.slice(end, Math.min(lineEnd, end + CONTEXT_WINDOW));

  if (DEGREE_CONTEXT_WORD.test(before) || DEGREE_CONTEXT_WORD.test(after)) return true;

  const viaPreposition = FIELD_CAPTURE.exec(after);
  if (viaPreposition?.[1] !== undefined && canonicalizeField(viaPreposition[1]) !== null) {
    return true;
  }

  const direct = DIRECT_FIELD_ADJACENT.exec(after);
  if (direct?.[1] !== undefined && canonicalizeField(direct[1]) !== null) {
    return true;
  }

  return false;
}

/**
 * Detects degree-level mentions and (when stated) a field of study. One
 * attribute is emitted per distinct degree keyword found, so a candidate
 * listing multiple degrees gets multiple attributes.
 *
 * Section-header detection and bullet segmentation are not needed here — a
 * degree keyword is meaningful wherever it appears, and restricting the scan
 * to an "Education" section would silently miss degrees listed inline (e.g.
 * "Master's, self-funded while working full time").
 */
export function extractEducation(text: string): readonly EducationAttribute[] {
  if (text.length === 0) return [];

  const results: EducationAttribute[] = [];
  const claimed = new Array<boolean>(text.length).fill(false);

  for (const { level, pattern } of DEGREE_PATTERNS) {
    const regex = new RegExp(pattern);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      // Every DEGREE_PATTERNS alternative requires at least one literal
      // character, so a zero-width match is not possible here — see the
      // identical note in extractSkills.
      const end = start + match[0].length;

      let overlaps = false;
      for (let i = start; i < end; i += 1) {
        if (claimed[i] === true) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      const value = text.slice(start, end);

      // Guard: a bare ambiguous abbreviation (MS, BA, MD, AS, ...) is only
      // kept when the surrounding text corroborates it as a degree. This
      // check runs before claiming the span, so a rejected "MS" in "MS
      // Office" leaves that text unclaimed rather than silently blocking
      // some other pattern from it.
      const normalizedForm = value.toLowerCase().replace(/[.\s]/g, '');
      if (AMBIGUOUS_BARE_FORMS.has(normalizedForm) && !hasDegreeContext(text, start, end)) {
        continue;
      }

      for (let i = start; i < end; i += 1) claimed[i] = true;

      const lineEnd = (() => {
        const nl = text.indexOf('\n', end);
        return nl === -1 ? text.length : nl;
      })();
      const trailing = text.slice(end, Math.min(lineEnd, end + 120));
      const fieldMatch = FIELD_CAPTURE.exec(trailing);
      const field = fieldMatch?.[1] !== undefined ? canonicalizeField(fieldMatch[1]) : null;

      const sourceSpan = { start, end };
      assertValidSpan(text, sourceSpan, value);

      results.push({
        kind: 'education',
        value,
        normalizedValue: level,
        confidence: CONFIDENCE,
        sourceSpan,
        degreeLevel: level,
        field,
      });
    }
  }

  return results.sort(
    (a, b) => a.sourceSpan.start - b.sourceSpan.start || a.sourceSpan.end - b.sourceSpan.end,
  );
}
