/**
 * Deterministic English-vs-not language heuristic (ADR-006: non-English CVs
 * are never scored — `all-MiniLM-L6-v2` and the rule-based extraction are
 * both English-only, so a confident score on a non-English document would
 * be C7's exact failure: a confident, meaningless number).
 *
 * Method: count how many whitespace-delimited alphabetic tokens are common
 * English function words (stopwords), as a fraction of all tokens. English
 * prose is dense with these ("the", "and", "of", "is", ...); most other
 * languages' equivalent function words are different strings, so the ratio
 * separates them cleanly in practice.
 *
 * **Honest limitations, stated per Section 0.1 / ADR-006:**
 * - This is a word-list heuristic, not a real language-identification
 *   model. It only distinguishes "recognizably English" from "not", and
 *   only for Latin-script text — it was not built or tested to identify
 *   *which* other language a document is in.
 * - Short documents (see {@link MIN_WORDS_FOR_JUDGEMENT}) do not carry
 *   enough signal to judge either way; the result is `isEnglish: null`
 *   ("unknown"), which callers must treat the same as "do not score" —
 *   silence is not evidence of English.
 * - A document that is legitimately English but unusually low in function
 *   words (e.g. a bullet-only skills list with almost no prose) can be
 *   misjudged as non-English. This heuristic is a stated tradeoff for the
 *   slice, not a permanent design — see DECISIONS.md ADR-006.
 * - A non-English document that happens to borrow enough English loanwords
 *   or cognates (e.g. "a" is also a French verb form) can inflate the
 *   ratio; the threshold is set well clear of the measured French fixture
 *   ratio, but is not a formal guarantee.
 */

const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'and',
  'of',
  'to',
  'in',
  'is',
  'that',
  'for',
  'with',
  'as',
  'on',
  'at',
  'by',
  'from',
  'this',
  'be',
  'are',
  'was',
  'were',
  'a',
  'an',
  'it',
  'has',
  'have',
  'had',
  'not',
  'or',
  'but',
  'if',
  'then',
  'so',
  'we',
  'you',
  'your',
  'i',
  'he',
  'she',
  'they',
  'their',
  'his',
  'her',
  'its',
  'will',
  'can',
  'would',
  'should',
  'could',
  'do',
  'does',
  'did',
  'been',
  'which',
  'who',
  'what',
  'when',
  'where',
  'how',
]);

/** Below this token count, there is not enough signal to judge either way. */
const MIN_WORDS_FOR_JUDGEMENT = 8;

/**
 * Minimum stopword ratio to call a document English. Chosen with real
 * headroom above the measured non-English fixture (French CV prose measured
 * ~0.026) and well below typical English prose (measured ~0.35 on the
 * English fixture) — not tuned against a broad corpus, so treat as a coarse
 * cut rather than a calibrated boundary.
 */
const ENGLISH_STOPWORD_RATIO_THRESHOLD = 0.08;

export interface LanguageDetectionResult {
  /** true = judged English, false = judged not English, null = not enough
   *  text to judge either way. */
  isEnglish: boolean | null;
  /** Fraction of tokens that were recognized English stopwords. */
  ratio: number;
  /** Total alphabetic tokens considered. */
  wordCount: number;
}

export function detectLanguageHeuristic(text: string): LanguageDetectionResult {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];

  if (words.length < MIN_WORDS_FOR_JUDGEMENT) {
    return { isEnglish: null, ratio: 0, wordCount: words.length };
  }

  const matched = words.filter((word) => ENGLISH_STOPWORDS.has(word)).length;
  const ratio = matched / words.length;

  return { isEnglish: ratio >= ENGLISH_STOPWORD_RATIO_THRESHOLD, ratio, wordCount: words.length };
}
