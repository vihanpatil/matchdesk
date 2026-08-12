import type { SourceSpan } from './types.js';

/**
 * Mandatory invariant check (Section 6.2): every extracted attribute must
 * carry a span that is genuinely in-bounds for the text it was extracted
 * from, and — when the extractor knows the exact surface text it matched —
 * that the span actually covers that text. This is asserted in code, not
 * left to test coverage alone, so a future extractor cannot silently emit a
 * bogus span.
 *
 * @param text         The full input text the span indexes into.
 * @param span         Candidate `[start, end)` character-offset span.
 * @param expectedText When provided, the exact surface text the span is
 *                      expected to cover (compared case-insensitively, since
 *                      an extractor may know the matched text's canonical
 *                      casing rather than its literal surface casing).
 * @throws Error if the span is out of bounds, inverted, non-integer, or
 *         (when `expectedText` is given) does not cover that text.
 */
export function assertValidSpan(text: string, span: SourceSpan, expectedText?: string): void {
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end)) {
    throw new Error(
      `Invalid span: start and end must be integers, received start=${String(span.start)} end=${String(span.end)}`,
    );
  }
  if (span.start < 0 || span.end > text.length || span.start >= span.end) {
    throw new Error(
      `Invalid span [${String(span.start)}, ${String(span.end)}) for text of length ${String(text.length)}`,
    );
  }
  if (expectedText !== undefined) {
    const actual = text.slice(span.start, span.end);
    if (actual.toLowerCase() !== expectedText.toLowerCase()) {
      throw new Error(
        `Span text mismatch: expected "${expectedText}" but span [${String(span.start)}, ${String(span.end)}) covers "${actual}"`,
      );
    }
  }
}
