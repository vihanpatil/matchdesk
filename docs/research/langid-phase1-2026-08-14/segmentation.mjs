// Ported (read-only source, not modified) from
// apps/server/src/ingestion/languageDetection.ts as of 2026-08-14, to
// measure candidate granularities against the REAL windowing/stripping
// mechanics the production detector uses. Functions below are copied
// verbatim except `linePairs`, which is a NEW granularity this sweep is
// specifically asked to measure and has no production equivalent.
//
// Ported verbatim: MIN_LETTERS_FOR_WINDOW, MAX_LINES_PER_WINDOW,
// EMAIL_OR_URL, ACRONYM, stripNeutralTokens, letterCount, linesWithOffsets,
// splitWithOffsets, lineWindows, SENTENCE_BOUNDARY.

export const MIN_LETTERS_FOR_WINDOW = 100;
export const MAX_LINES_PER_WINDOW = 12;

const EMAIL_OR_URL = /\S+@\S+|https?:\/\/\S+/g;
const ACRONYM = /^[A-Z][A-Z/&.-]{1,}$/;

/** Verbatim port of stripNeutralTokens (languageDetection.ts:597). */
export function stripNeutralTokens(text) {
  return text
    .replace(EMAIL_OR_URL, ' ')
    .split(/\s+/)
    .filter((t) => t !== '')
    .filter((t) => !/\d/.test(t))
    .filter((t) => !ACRONYM.test(t))
    .join(' ');
}

/** Verbatim port of letterCount (languageDetection.ts:608). */
export function letterCount(text) {
  return (text.match(/\p{L}/gu) ?? []).length;
}

/** Verbatim port of linesWithOffsets (languageDetection.ts:686). */
export function linesWithOffsets(text) {
  const found = [];
  let cursor = 0;
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      const start = text.indexOf(trimmed, cursor);
      if (start !== -1) found.push({ text: trimmed, start, end: start + trimmed.length });
    }
    cursor += raw.length + 1;
  }
  return found;
}

/** Verbatim port of splitWithOffsets (languageDetection.ts:667). */
export function splitWithOffsets(text, boundary) {
  const found = [];
  let cursor = 0;
  for (const piece of text.split(boundary)) {
    const trimmed = piece.trim();
    if (trimmed.length === 0) continue;
    const start = text.indexOf(trimmed, cursor);
    if (start === -1) continue;
    found.push({ text: trimmed, start, end: start + trimmed.length });
    cursor = start + trimmed.length;
  }
  return found;
}

/** Verbatim port of the SENTENCE_BOUNDARY regex (languageDetection.ts:316). */
export const SENTENCE_BOUNDARY = /\n+|(?<=[.!?])\s+/;

/** Verbatim port of lineWindows (languageDetection.ts:709) -- the EXISTING
 *  production granularity ("existing windows, >=100 letters"). */
export function lineWindows(text) {
  const lines = linesWithOffsets(text);
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    for (let j = i; j < lines.length && j - i < MAX_LINES_PER_WINDOW; j++) {
      const first = lines[i];
      const last = lines[j];
      if (first === undefined || last === undefined) break;

      const slice = text.slice(first.start, last.end);
      if (letterCount(stripNeutralTokens(slice)) < MIN_LETTERS_FOR_WINDOW) continue;

      found.push({ text: slice, start: first.start, end: last.end, floorCleared: true });
      break;
    }
  }

  return found;
}

/** Single lines granularity -- each non-blank line is its own segment. */
export function singleLines(text) {
  return linesWithOffsets(text);
}

/** NEW granularity for this sweep, no production equivalent: every
 *  consecutive pair of non-blank lines, sliding by one. A document with N
 *  lines produces N-1 pairs (or, for N===1, the single line itself so a
 *  one-line document is not silently excluded from this granularity). */
export function linePairs(text) {
  const lines = linesWithOffsets(text);
  if (lines.length === 0) return [];
  if (lines.length === 1) {
    const l = lines[0];
    return [{ text: l.text, start: l.start, end: l.end }];
  }
  const found = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const first = lines[i];
    const second = lines[i + 1];
    found.push({
      text: `${first.text}\n${second.text}`,
      start: first.start,
      end: second.end,
    });
  }
  return found;
}

/** Sentence segments granularity -- production's SENTENCE_BOUNDARY split,
 *  used alone (not unioned with paragraph/window splits the way segmentsOf
 *  does in production). */
export function sentenceSegments(text) {
  return splitWithOffsets(text, SENTENCE_BOUNDARY);
}

export function segmentsFor(granularity, text) {
  switch (granularity) {
    case 'windows100':
      return lineWindows(text);
    case 'lines':
      return singleLines(text);
    case 'linePairs':
      return linePairs(text);
    case 'sentences':
      return sentenceSegments(text);
    default:
      throw new Error(`unknown granularity: ${granularity}`);
  }
}

export function condition(mode, text) {
  if (mode === 'raw') return text;
  if (mode === 'stripped') return stripNeutralTokens(text);
  throw new Error(`unknown conditioning: ${mode}`);
}
