import { assertValidSpan } from './span.js';
import type { DegreeLevel, EducationAttribute } from './types.js';

const CONFIDENCE = 0.85;

/**
 * Degree-level keyword patterns, most-specific first. Deliberately contains
 * NO year pattern anywhere in this file and NO capture of surrounding
 * "University of X" / "X Institute" text — ADR-007 is binding: institution
 * name and graduation year are never extracted, not merely unused.
 */
const DEGREE_PATTERNS: readonly { readonly level: DegreeLevel; readonly pattern: RegExp }[] = [
  { level: 'professional', pattern: /\b(?:j\.?d\.?|juris doctor|m\.?d\.?)\b/gi },
  { level: 'doctorate', pattern: /\b(?:ph\.?d\.?|doctorate|doctoral degree)\b/gi },
  {
    level: 'master',
    pattern: /\b(?:master'?s?(?:\s+degree)?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|m\.?eng\.?)\b/gi,
  },
  {
    level: 'bachelor',
    pattern: /\b(?:bachelor'?s?(?:\s+degree)?|b\.?s\.?|b\.?a\.?|b\.?eng\.?|b\.?tech\.?)\b/gi,
  },
  { level: 'associate', pattern: /\b(?:associate'?s?(?:\s+degree)?|a\.?a\.?|a\.?s\.?)\b/gi },
  { level: 'high_school', pattern: /\bhigh school(?:\s+diploma)?\b/gi },
];

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
      for (let i = start; i < end; i += 1) claimed[i] = true;

      const value = text.slice(start, end);

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
