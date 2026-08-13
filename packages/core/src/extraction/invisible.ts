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
 * tokenization.
 *
 * **This was a hand-written list of six code points, and that was wrong**
 * (H-048). Adversarial enumeration found SIXTEEN further characters that
 * produce the identical fabrication — `Java<CHAR>Script` extracting the skill
 * `java` — including the bidi marks and embeddings (U+200E, U+200F, U+202A,
 * U+202C, U+2066, U+2069), the invisible math operators (U+2061-U+2064),
 * variation selectors (U+FE00-U+FE0F), the combining grapheme joiner
 * (U+034F), the Mongolian vowel separator (U+180E), interlinear annotation
 * (U+FFF9) and the Unicode tag characters. A hand-maintained list is the
 * wrong SHAPE for this problem: the set is defined by a Unicode property, so
 * the pattern must be too, or it goes stale every time a producer picks a
 * different separator.
 *
 * `\p{Cf}` (Format) covers every zero-width and directional-control
 * character, including all six originals. Variation selectors are matched by
 * their own binary property, and the combining grapheme joiner (U+034F) and
 * Mongolian vowel separator (U+180E) are named explicitly.
 *
 * **`\p{Mn}` is deliberately NOT used**, even though variation selectors live
 * in it: the rest of `Mn` is real diacritics. Sweeping the category would
 * strip the accent from "Rémi", altering a person's name — and the combining
 * acute U+0301 is verified NOT to match this pattern.
 *
 * **Deliberately NOT stripped — a decision, not an oversight:**
 *
 * - **Whitespace that renders as a space** — U+00A0 no-break space, U+202F,
 *   U+2009, U+200A, U+2007. These are VISIBLE. A human reading
 *   `Java<NBSP>Script` sees "Java Script", two words, and extracting `java`
 *   agrees with the page. Stripping them would join genuinely separate words
 *   and invent skills no reader can see — the same defect this module exists
 *   to prevent, pointing the other way.
 * - **U+FFFC object replacement character** — renders as a visible box
 *   standing in for an embedded object. Removing it would splice together
 *   text a reader sees as separated.
 */
// Alternation, not a character class: ESLint's `no-misleading-character-class`
// correctly objects to combining marks inside a class, and it is right that
// such a class is easy to misread.
const INVISIBLE_PATTERN = /\p{Cf}|\p{Variation_Selector}|\u034F|\u180E/u;
const INVISIBLE_PATTERN_GLOBAL = new RegExp(INVISIBLE_PATTERN, 'gu');

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
  let index = 0;

  // Iterates by CODE POINT (`for...of` over a string), not by UTF-16 code
  // unit. The Unicode tag characters (U+E0000 block) are astral and arrive as
  // surrogate PAIRS; testing each half separately matches nothing, so a
  // code-unit loop silently fails to strip exactly the characters that are
  // hardest to notice. Offsets stay in UTF-16 units because that is what
  // `String.prototype.slice` and every stored span use.
  for (const char of text) {
    if (!INVISIBLE_PATTERN.test(char)) {
      cleaned += char;
      for (let unit = 0; unit < char.length; unit++) kept.push(index + unit);
    }
    index += char.length;
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
