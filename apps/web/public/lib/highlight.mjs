/**
 * Evidence highlighting (ADR-036): turns a document plus character spans into
 * ordered segments the view renders as text nodes and <mark> elements — the
 * DOM API does the escaping, so no HTML string concatenation exists anywhere.
 *
 * Spans are [start, end) offsets into the ORIGINAL text (Section 6.2), may
 * arrive unsorted and may overlap (two attributes citing one phrase); overlaps
 * merge so a run of text is marked once.
 */

/**
 * @param {string} text
 * @param {readonly { start: number, end: number }[]} spans
 * @returns {{ text: string, marked: boolean }[]}
 */
export function highlightSegments(text, spans) {
  const clipped = spans
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(text.length, s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  /** @type {{ start: number, end: number }[]} */
  const merged = [];
  for (const span of clipped) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }

  /** @type {{ text: string, marked: boolean }[]} */
  const out = [];
  let cursor = 0;
  for (const span of merged) {
    if (span.start > cursor) out.push({ text: text.slice(cursor, span.start), marked: false });
    out.push({ text: text.slice(span.start, span.end), marked: true });
    cursor = span.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), marked: false });
  return out;
}
