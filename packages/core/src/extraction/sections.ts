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
 */
const HEADER_PATTERNS: readonly { readonly name: SectionName; readonly pattern: RegExp }[] = [
  { name: 'summary', pattern: /^(summary|professional summary|profile|about)$/i },
  { name: 'skills', pattern: /^(skills|technical skills|core competencies)$/i },
  {
    name: 'experience',
    pattern: /^(experience|work experience|employment history|professional experience)$/i,
  },
  { name: 'education', pattern: /^(education|academic background)$/i },
  { name: 'certifications', pattern: /^(certifications?|licenses? (and|&) certifications?)$/i },
  { name: 'projects', pattern: /^(projects|personal projects)$/i },
];

/**
 * Splits text into sections by scanning for lines that are ENTIRELY a
 * recognized header (Section-header detection technique from the task
 * brief). A line is a header candidate only when trimming it leaves nothing
 * but the header phrase — this is what keeps "- Experience with PostgreSQL"
 * from being mistaken for an "Experience" header.
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

    const match = HEADER_PATTERNS.find((candidate) => candidate.pattern.test(trimmed));
    if (match === undefined) continue;

    const leadingWs = rawLine.length - rawLine.trimStart().length;
    const headerStart = lineStart + leadingWs;
    headers.push({
      name: match.name,
      lineStart,
      headerSpan: { start: headerStart, end: headerStart + trimmed.length },
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
