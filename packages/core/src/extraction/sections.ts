import type { SourceSpan } from './types.js';

/** Canonical section names this engine reasons about. */
export type SectionName =
  'summary' | 'skills' | 'experience' | 'education' | 'certifications' | 'projects';

export interface Section {
  /** `null` for an implicit leading section with no recognized header. */
  readonly name: SectionName | null;
  /** Span of the header line itself (or `[0, 0)` for the implicit section). */
  readonly headerSpan: SourceSpan;
  /** Span of the whole section, header through the char before the next one. */
  readonly start: number;
  readonly end: number;
}

/**
 * Header synonyms, matched as a WHOLE trimmed line (case-insensitive), most
 * specific first within a name so "work experience" is recognized as
 * 'experience' rather than requiring a separate branch.
 *
 * H-028 D1: only ~4 experience synonyms were recognized, so a section ran
 * until the next RECOGNIZED header — an unrecognized `Education` header, for
 * example, silently swallowed everything after it, including an entire
 * employment history. The vocabulary below is drawn from real-world CV
 * conventions (see `testkit/cv.ts`), not from what the original author
 * imagined. Every alternative here is matched against a line ALREADY
 * normalized by `normalizeHeaderLine` (trailing colon stripped, `&`
 * rewritten to `and`, whitespace collapsed, case-folded via the `i` flag) so
 * "Skills & Tools", "Skills and Tools", "SKILLS & TOOLS:" and "skills &
 * tools" all reach the same alternative without being listed separately.
 */
const HEADER_ALTERNATIVES: readonly {
  readonly name: SectionName;
  readonly alternatives: string;
}[] = [
  { name: 'summary', alternatives: 'summary|professional summary|profile|about' },
  {
    name: 'skills',
    alternatives:
      'skills|technical skills|key skills|core skills|skills and tools|core competencies',
  },
  {
    name: 'experience',
    alternatives:
      'experience|work experience|professional experience|employment history|work history|career history|employment|relevant experience|professional background|career summary',
  },
  { name: 'education', alternatives: 'education|education and training|academic background' },
  { name: 'certifications', alternatives: 'certifications?|licenses? and certifications?' },
  { name: 'projects', alternatives: 'projects|personal projects' },
];

const HEADER_PATTERNS: readonly { readonly name: SectionName; readonly pattern: RegExp }[] =
  HEADER_ALTERNATIVES.map(({ name, alternatives }) => ({
    name,
    pattern: new RegExp(`^(?:${alternatives})$`, 'i'),
  }));

/**
 * Matches a header phrase (one of `HEADER_ALTERNATIVES`) at the START of a
 * line, with an optional trailing colon, capturing whatever comes after so
 * the caller can decide whether it is a legitimate separator. Built per name
 * so the longest-alternative-first ordering already curated in
 * `HEADER_ALTERNATIVES` (e.g. "employment history" before "employment")
 * still wins the leftmost-alternative match JS regex performs.
 */
const HEADER_PREFIX_PATTERNS: readonly { readonly name: SectionName; readonly pattern: RegExp }[] =
  HEADER_ALTERNATIVES.map(({ name, alternatives }) => ({
    name,
    pattern: new RegExp(`^(?:${alternatives}):?`, 'i'),
  }));

/**
 * A run of 2+ spaces, one or more tabs, or a run of 2+ rule/punctuation
 * characters (optionally preceded by a single space, so "Education
 * ________________" — one space then a decorative rule — still counts). A
 * SINGLE plain space is deliberately excluded: that is what keeps "Experience
 * with Python and Docker" and "Experience Manager, Acme Corp, 2019 - 2022"
 * from being mistaken for a header sharing its line with trailing matter —
 * see H-100 and H-028 D4.
 */
const TRAILING_SEPARATOR = /^ ?(?:\t+| {2,}|[-_=~.*•·∙‣▪◦]{2,})\s*/;

/**
 * A bare date or date range: "2022", "2019 - 2022", "Jan 2019 - Present". No
 * other words are allowed, which is what keeps "Manager, Acme Corp, 2019 -
 * 2022" (a job title/company PRECEDING the date) from qualifying — the date
 * must be the entirety of the trailing matter.
 */
const DATE_ENDPOINT = /(?:present|current|[A-Za-z]{3,9}\.?\s+\d{4}|\d{4})/i;
const TRAILING_DATE = new RegExp(
  `^${DATE_ENDPOINT.source}(?:\\s*(?:[-–—]|to)\\s*${DATE_ENDPOINT.source})?$`,
  'i',
);

/**
 * A location-shaped fragment: one to four Title-Case words, optionally
 * followed by a comma and one to four more Title-Case words — "Leeds, UK",
 * "San Francisco, CA", "Remote". No digits anywhere (a date makes it not a
 * bare location) and no lowercase leading words (ordinary prose starts
 * lowercase-inflected: "with Python...", "is important..."). This is
 * intentionally narrow: it cannot distinguish "Leeds, UK" from a job
 * title/company pair like "Team Lead, Acme Corp" that happens to also be
 * Title Case with no digits — see the report's residual note.
 */
const TITLE_CASE_WORD = "[A-Z][A-Za-z.'-]*";
const TRAILING_LOCATION = new RegExp(
  `^${TITLE_CASE_WORD}(?: ${TITLE_CASE_WORD}){0,3}(?:, ?${TITLE_CASE_WORD}(?: ${TITLE_CASE_WORD}){0,3})?$`,
);

/**
 * Runs of single letters separated by single spaces — "E D U C A T I O N" —
 * collapsed to the plain word before header matching, so letter-spaced
 * (tracked) headers reach the same vocabulary check as ordinary ones. A
 * minimum of 4 letters (three "letter space" repeats plus a final letter)
 * keeps short incidental sequences like "U S A" from being collapsed, since
 * every recognized header word has at least 5 letters.
 */
const LETTER_SPACED_RUN = /\b(?:[A-Za-z]\s){3,}[A-Za-z]\b/g;

function collapseLetterSpacing(line: string): string {
  return line.replace(LETTER_SPACED_RUN, (run) => run.replace(/\s+/g, ''));
}

/**
 * Whether `trailing` (the text remaining after a header phrase and a
 * qualifying `TRAILING_SEPARATOR`) is matter that plausibly belongs to a
 * header's own line rather than to unrelated content that happens to follow
 * a header-shaped word. Deliberately CONSTRAINED, not free-form: an
 * unconstrained "anything after a strict separator counts" rule was tried
 * and rejected, because it turns "Experience<TAB>Manager, Acme Corp, 2019 -
 * 2022" (a real job-title row, tab-aligned like a table) into a header line,
 * which is exactly the H-028 D4 shape the task called out as the case that
 * matters most.
 */
function isConstrainedTrailingMatter(trailing: string): boolean {
  if (trailing.length === 0) return true; // separator alone (e.g. a decorative rule) is fine
  return TRAILING_DATE.test(trailing) || TRAILING_LOCATION.test(trailing);
}

/**
 * Normalizes a header CANDIDATE line for matching against `HEADER_PATTERNS`
 * only — the original `trimmed` text (colon and all) is still what
 * `headerSpan` covers, so evidence shown to a recruiter is never rewritten.
 * Handles three variations generally, per real CVs, rather than by listing
 * every literal string: a trailing colon ("Experience:"), `&` vs "and"
 * ("Skills & Tools" / "Skills and Tools"), and incidental extra whitespace
 * left behind by stripping either of those. Case is handled separately, by
 * the `i` flag on every pattern above.
 */
function normalizeHeaderLine(trimmed: string): string {
  const withoutColon = trimmed.endsWith(':') ? trimmed.slice(0, -1) : trimmed;
  return withoutColon.replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
}

interface HeaderLineMatch {
  readonly name: SectionName;
  /** How many chars, from the start of `trimmed`, the header phrase itself occupies. */
  readonly headerLength: number;
}

/**
 * Recognizes a header CANDIDATE line two ways, in order:
 *
 * 1. WHOLE-LINE (original H-028 D1 rule, unchanged in spirit): trimming the
 *    line leaves nothing but a known header phrase. Letter-spaced headers
 *    ("E D U C A T I O N") are collapsed first so they reach this path too.
 * 2. PREFIX + SEPARATOR + CONSTRAINED TRAILING MATTER (H-100): the header
 *    phrase starts the line, followed by a run of 2+ spaces, a tab, or a
 *    rule/punctuation run — never a single space — and then either nothing
 *    or trailing matter that is itself constrained to look like a location
 *    or a date (see `isConstrainedTrailingMatter`). This is what recognizes
 *    "Education   Leeds, UK" without also recognizing "Experience Manager,
 *    Acme Corp, 2019 - 2022" (a job-title row, not a header row) — the
 *    latter's trailing matter has a job title AND a company before its date,
 *    which the constrained trailing check rejects.
 */
function matchHeaderLine(trimmed: string): HeaderLineMatch | undefined {
  const wholeLineNormalized = normalizeHeaderLine(collapseLetterSpacing(trimmed));
  const wholeLineMatch = HEADER_PATTERNS.find((candidate) =>
    candidate.pattern.test(wholeLineNormalized),
  );
  if (wholeLineMatch !== undefined) {
    return { name: wholeLineMatch.name, headerLength: trimmed.length };
  }

  for (const { name, pattern } of HEADER_PREFIX_PATTERNS) {
    const headMatch = pattern.exec(trimmed);
    if (headMatch === null) continue;
    const remainder = trimmed.slice(headMatch[0].length);
    const separatorMatch = TRAILING_SEPARATOR.exec(remainder);
    if (separatorMatch === null) continue;
    const trailing = remainder.slice(separatorMatch[0].length);
    if (!isConstrainedTrailingMatter(trailing)) continue;
    return { name, headerLength: headMatch[0].length };
  }

  return undefined;
}

/**
 * Splits text into sections by scanning for lines that are ENTIRELY a
 * recognized header, or a recognized header sharing its line with
 * constrained trailing matter (Section-header detection technique from the
 * task brief, extended by H-100). A line is a header candidate only when
 * trimming it leaves nothing but the header phrase, or the header phrase
 * plus a strictly-separated, constrained tail — this is what keeps
 * "- Experience with PostgreSQL" and "Experience Manager, Acme Corp, 2019 -
 * 2022" from being mistaken for an "Experience" header.
 *
 * Returns `[]` for empty text. For text with no recognized header at all,
 * returns a single section with `name: null` spanning the whole text, so
 * downstream extractors always have at least one section to iterate.
 */
export function detectSections(text: string): readonly Section[] {
  if (text.length === 0) return [];

  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }

  const headers: { name: SectionName; lineStart: number; headerSpan: SourceSpan }[] = [];
  for (const lineStart of lineStarts) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;
    const rawLine = text.slice(lineStart, lineEnd);
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;

    const match = matchHeaderLine(trimmed);
    if (match === undefined) continue;

    const leadingWs = rawLine.length - rawLine.trimStart().length;
    const headerStart = lineStart + leadingWs;
    headers.push({
      name: match.name,
      lineStart,
      headerSpan: { start: headerStart, end: headerStart + match.headerLength },
    });
  }

  if (headers.length === 0) {
    return [{ name: null, headerSpan: { start: 0, end: 0 }, start: 0, end: text.length }];
  }

  const sections: Section[] = [];
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    const next = headers[i + 1];
    if (header === undefined) continue;
    const sectionStart = header.lineStart;
    const sectionEnd = next === undefined ? text.length : next.lineStart;
    sections.push({
      name: header.name,
      headerSpan: header.headerSpan,
      start: sectionStart,
      end: sectionEnd,
    });
  }

  // Leading prose before the first header, if any, forms an implicit section.
  const first = headers[0];
  if (first !== undefined && first.lineStart > 0) {
    sections.unshift({
      name: null,
      headerSpan: { start: 0, end: 0 },
      start: 0,
      end: first.lineStart,
    });
  }

  return sections;
}
