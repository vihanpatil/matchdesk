/** One line of text after bullet-marker stripping and trimming. */
export interface LineSegment {
  /** Trimmed line text with any leading bullet marker removed. */
  readonly text: string;
  /** True if a leading bullet marker (-, *, •, "1.", "2)") was stripped. */
  readonly isBullet: boolean;
  /** Span of `text` exactly as it sits in the original input. */
  readonly start: number;
  readonly end: number;
}

/** Leading bullet markers: -, *, •, or a number followed by "." or ")". */
const BULLET_MARKER = /^(?:[-*•]|\d+[.)])\s+/;

/**
 * Bullet segmentation (Section 2 technique): splits text into non-empty,
 * trimmed lines, stripping a common leading bullet marker from each so the
 * remaining extractors work on clean surface text. Every returned span
 * exactly covers `text` in the ORIGINAL input, accounting for both the
 * marker and any surrounding whitespace that got trimmed away.
 */
export function segmentLines(text: string): readonly LineSegment[] {
  if (text.length === 0) return [];

  const segments: LineSegment[] = [];
  let cursor = 0;
  while (cursor <= text.length) {
    const newlineIndex = text.indexOf('\n', cursor);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;
    const rawLine = text.slice(cursor, lineEnd);

    const markerMatch = BULLET_MARKER.exec(rawLine);
    const afterMarker = markerMatch !== null ? rawLine.slice(markerMatch[0].length) : rawLine;
    const markerOffset = markerMatch !== null ? markerMatch[0].length : 0;

    const leadingWs = afterMarker.length - afterMarker.trimStart().length;
    const trimmed = afterMarker.trim();

    if (trimmed.length > 0) {
      const start = cursor + markerOffset + leadingWs;
      segments.push({
        text: trimmed,
        isBullet: markerMatch !== null,
        start,
        end: start + trimmed.length,
      });
    }

    if (newlineIndex === -1) break;
    cursor = lineEnd + 1;
  }

  return segments;
}
