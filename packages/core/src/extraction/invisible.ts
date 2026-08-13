import type { SourceSpan } from './types.js';

/**
 * Invisible-character tolerance for extraction (HONESTY_LOG H-034).
 *
 * PDF and DOCX producers routinely emit code points that render as nothing:
 * a soft hyphen at a justified line break, a zero-width space inside a
 * ligature or between styled runs, a BOM at the head of the stream. The
 * recruiter sees "JavaScript" and so does the candidate. The extractor saw
 * `Java<ZWSP>Script`.
 *
 * Measured before this existed, and it is worse than "extraction breaks":
 *
 *     "Java<ZWSP>Script"        -> skill `java`   (not lost — CHANGED)
 *     "Software Enginee<ZWSP>r" -> skill `r`      (FABRICATED from "Engineer")
 *
 * The second is H-028 D3 — the defect where "Rémi" produced skill `r` and
 * ranked the candidate eligible for an R role — reappearing by a different
 * route, with an invisible character as the trigger instead of an accent.
 *
 * **How this preserves the evidence invariant.** Extraction runs against the
 * cleaned text, and every resulting span is mapped back to coordinates in the
 * ORIGINAL text before it is returned. A span covering `Java<ZWSP>Script`
 * therefore covers all eleven original characters, so highlighting still
 * lands exactly on the word in the stored document — `assertValidSpan` holds
 * against the original text, not a copy. Nothing downstream needs to know
 * this module exists.
 *
 * **Fast path:** a document containing no invisible characters — every real
 * document in the test corpus — is passed straight through with no cleaning,
 * no mapping and no allocation, so this cannot change existing behaviour.
 */

/**
 * Code points that are invisible when rendered and must never influence
 * tokenization. Deliberately NOT a general Unicode category sweep: this is
 * the closed set of format/zero-width characters real document producers
 * emit. Anything visible — including unusual whitespace — is left alone,
 * because removing it could join two genuinely separate words.
 */
// Alternation rather than a character class: a class containing ZWJ trips
// `no-misleading-character-class`, and the rule is right that a class of
// joiners is easy to misread. Escapes rather than literals so the source
// itself contains no invisible characters — this file must stay greppable.
const INVISIBLE_PATTERN = /\u00AD|\u200B|\u200C|\u200D|\u2060|\uFEFF/;
const INVISIBLE_PATTERN_GLOBAL = new RegExp(INVISIBLE_PATTERN, 'g');

export interface CleanedText {
  /** The text with every invisible character removed. */
  readonly text: string;
  /**
   * Maps an offset in {@link text} back to the corresponding offset in the
   * original. `start` offsets map directly; `end` offsets (exclusive) must be
   * mapped with {@link mapEnd}.
   */
  readonly mapStart: (cleanOffset: number) => number;
  /** Maps an exclusive end offset back to an exclusive end in the original. */
  readonly mapEnd: (cleanOffset: number) => number;
}

/** True when `text` contains at least one invisible character. */
export function hasInvisibleCharacters(text: string): boolean {
  return INVISIBLE_PATTERN.test(text);
}

/**
 * Removes invisible characters, retaining the offset of every surviving
 * character so spans can be mapped back afterwards.
 */
export function stripInvisibleCharacters(text: string): CleanedText {
  const kept: number[] = [];
  let cleaned = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === undefined) continue;
    if (INVISIBLE_PATTERN.test(char)) continue;
    cleaned += char;
    kept.push(i);
  }

  return {
    text: cleaned,
    mapStart: (offset) => kept[offset] ?? text.length,
    // An exclusive end maps through the LAST included character, so a
    // trailing invisible is never swept into the span.
    mapEnd: (offset) => {
      const lastIncluded = kept[offset - 1];
      return lastIncluded === undefined ? 0 : lastIncluded + 1;
    },
  };
}

/** The shape every extracted attribute shares that this module rewrites. */
interface Spanned {
  readonly value: string;
  readonly sourceSpan: SourceSpan;
}

/**
 * Runs `extract` with invisible characters removed, then restates every span
 * in original-text coordinates.
 *
 * `value` is re-read from the original text so that it and `sourceSpan`
 * always agree — the evidence a recruiter is shown is the real substring of
 * the real document, invisible characters and all. `normalizedValue` is
 * untouched, so the canonical identity of the match is unaffected.
 */
export function extractIgnoringInvisibleCharacters<T extends Spanned>(
  text: string,
  extract: (text: string) => readonly T[],
): readonly T[] {
  if (!hasInvisibleCharacters(text)) return extract(text);

  const cleaned = stripInvisibleCharacters(text);

  return extract(cleaned.text).map((attribute): T => {
    const start = cleaned.mapStart(attribute.sourceSpan.start);
    const end = cleaned.mapEnd(attribute.sourceSpan.end);
    return { ...attribute, value: text.slice(start, end), sourceSpan: { start, end } };
  });
}

/** Removes invisible characters without retaining offsets, for callers that
 *  only need to inspect the text (never to produce a span from it). */
export function withoutInvisibleCharacters(text: string): string {
  return text.replace(INVISIBLE_PATTERN_GLOBAL, '');
}
