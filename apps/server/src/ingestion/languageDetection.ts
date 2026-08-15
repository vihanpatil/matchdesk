/**
 * English-vs-not language detector (ADR-006: non-English CVs are never
 * scored — `all-MiniLM-L6-v2` and the rule-based extraction are both
 * English-only, so a confident score on a non-English document would be
 * C7's exact failure: a confident, meaningless number).
 *
 * **Method: `eld` (efficient-language-detector), `extrasmall` tier
 * (ADR-031, replacing the hand-built Cavnar & Trenkle n-gram profiler this
 * module used to carry).** `eld` is a trained language-ID library covering
 * 60 languages; imported from the `eld/extrasmall` subpath specifically
 * (not the default `eld` entry, which uses a computed dynamic `import()`
 * that defeats static bundling). The classifier is a drop-in replacement
 * behind the same seam — `detectLanguageHeuristic`'s public shape
 * (`LanguageDetectionResult`) is unchanged, so `extractText.ts` and
 * `findNonEnglishSegments` below are untouched by the swap itself.
 *
 * **Why the swap, precisely (ADR-031 — read before assuming this closes
 * H-041, because it does not).** The n-gram profiler mis-scored a German
 * compound-noun header block as English outright (`dEn 69621` vs
 * `dOther 70385`) because compound-noun lists are out-of-domain for
 * profiles built from prose; production caught that case only via a
 * mean-word-length threshold, which then had to be exempted for Indian
 * institution names after it falsely refused real Indian-English CVs
 * (H-086). `eld` catches the same German block correctly with no such
 * threshold and no exemption, measured clean across the eval corpora below
 * — so this swap deletes three heuristics that existed only to patch the
 * profiler's blind spots, at zero measured regression on English recall.
 *
 * **What this does NOT do.** `eld` is swapped in at the same granularity
 * the code already judged text at — whichever segment
 * `findNonEnglishSegments` hands it (paragraph / sentence / line-window),
 * or the whole document for the primary `extractText.ts` gate. It is
 * measured, not assumed, that this configuration costs zero English CVs
 * while still refusing every non-English one — see
 * `languageDetection.eval.test.ts`. It does **not** close the H-041
 * Germanic sub-floor gap (a short foreign line too small to form a line
 * window): that is a segmentation defect, not a classifier one, and
 * `languageDetection.eval.test.ts:591`'s `DOCUMENTED GAP` test asserts it
 * stays open on purpose.
 *
 * **Honest limitations, stated per Section 0.1 / ADR-006:**
 * - Short documents (see {@link MIN_WORDS_FOR_JUDGEMENT}) do not carry
 *   enough signal to judge either way; the result is `isEnglish: null`
 *   ("unknown"), which callers must treat the same as "do not score" —
 *   silence is not evidence of English.
 * - A CV that is almost entirely proper nouns and technology names shared
 *   verbatim across languages ("Python", "Docker", "AWS", "Kubernetes") is
 *   a hard case for any language-ID approach: those tokens are
 *   near-identical strings in every language's CV. Real CVs of this shape
 *   still carry enough surrounding structure (section headers, connective
 *   phrasing, verb endings) to separate correctly in the measured eval set,
 *   but a document that is *purely* a comma-separated technology list with
 *   zero structural English text is a genuine edge no character-statistics
 *   approach can promise to get right — flagged rather than papered over.
 * - A bilingual or code-switched document (e.g. an English CV with a French
 *   cover paragraph) is scored as one blob of text at the whole-document
 *   gate; the verdict reflects whichever language dominates. The
 *   per-segment veto below (`findNonEnglishSegments`, ADR-022) exists
 *   precisely because of this.
 * - `nearestOtherLanguage`/`distanceToNearestOther` are diagnostic only,
 *   restricted to the eight languages this module has historically
 *   reported on (French, German, Spanish, Italian, Dutch, Danish,
 *   Norwegian, Swedish) — `eld` itself covers 60 and its own top pick
 *   (used for `isEnglish`) is not restricted to this set.
 */
import { eld } from 'eld/extrasmall';

/** Below this token count, there is not enough text to judge either way. */
const MIN_WORDS_FOR_JUDGEMENT = 8;

/** Non-English languages this detector has historically reported a
 *  "nearest other" diagnostic for (ADR-006 only requires English-vs-not,
 *  not identifying which language a non-English document is in — `eld`'s
 *  own top-pick verdict, used for `isEnglish`, is not limited to this
 *  set). */
const NON_ENGLISH_LANGUAGES = ['fr', 'de', 'es', 'it', 'nl', 'da', 'no', 'sv'] as const;
type NonEnglishLanguage = (typeof NON_ENGLISH_LANGUAGES)[number];

/** Word tokens: runs of Unicode letters and apostrophes (keeps contractions
 *  like "d'expérience" and "colleague's" as single tokens). Used only for
 *  the word-count floor and the sub-floor function-word pass below — `eld`
 *  does its own tokenization internally. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
}

export interface LanguageDetectionResult {
  /** true = judged English, false = judged not English, null = not enough
   *  text to judge either way. `eld`'s own top-pick verdict (not restricted
   *  to the eight `NON_ENGLISH_LANGUAGES`) decides this. */
  isEnglish: boolean | null;
  /** Total alphabetic word tokens considered. */
  wordCount: number;
  /** Pseudo-distance to English, `1 - eld`'s confidence score for `en`
   *  (lower = more English-like). `null` when there was not enough text to
   *  judge. Diagnostic only. */
  distanceToEnglish: number | null;
  /** Pseudo-distance to the closest of the eight covered non-English
   *  languages, `1 -` that language's `eld` confidence score. `null` when
   *  there was not enough text to judge. Diagnostic only. */
  distanceToNearestOther: number | null;
  /** Which of the eight covered non-English languages had the highest `eld`
   *  confidence score (diagnostic only — this field does not decide
   *  `isEnglish`, and `eld`'s actual top pick may be a language outside this
   *  set of eight). `null` when there was not enough text to judge. */
  nearestOtherLanguage: NonEnglishLanguage | null;
}

export function detectLanguageHeuristic(text: string): LanguageDetectionResult {
  const words = wordsOf(text);

  if (words.length < MIN_WORDS_FOR_JUDGEMENT) {
    return {
      isEnglish: null,
      wordCount: words.length,
      distanceToEnglish: null,
      distanceToNearestOther: null,
      nearestOtherLanguage: null,
    };
  }

  const detection = eld.detect(text);
  const scores = detection.getScores();
  const distanceToEnglish = 1 - (scores['en'] ?? 0);

  let distanceToNearestOther = Infinity;
  let nearestOtherLanguage: NonEnglishLanguage | null = null;
  for (const lang of NON_ENGLISH_LANGUAGES) {
    const distance = 1 - (scores[lang] ?? 0);
    if (distance < distanceToNearestOther) {
      distanceToNearestOther = distance;
      nearestOtherLanguage = lang;
    }
  }

  // `eld`'s own top pick decides English-vs-not, unrestricted to the eight
  // reported languages (a document confidently in, say, Portuguese must not
  // read as "English" merely because English beats each of the eight in
  // `NON_ENGLISH_LANGUAGES` individually).
  const isEnglish = detection.language === 'en';

  return {
    isEnglish,
    wordCount: words.length,
    distanceToEnglish,
    distanceToNearestOther,
    nearestOtherLanguage,
  };
}

// -------------------------------------------------------------------------
// Mixed-language (code-switching) veto — ADR-022.
//
// `detectLanguageHeuristic` judges a document as ONE blob, so a CV that is
// half English and half French wins the comparison for whichever language's
// statistics dominate. Measured on this detector: a document with 50% French
// sentences still classified English. Scoring it means running English-only
// extraction over text we cannot read and reporting a confident number for
// the half we could — C7's exact failure.
//
// **Why this is not a confidence threshold.** The obvious fix is to refuse
// when English wins only narrowly. It cannot work here, and the numbers say
// so: relative margin ((dOther - dEn) / dEn) for `headers_plus_tech_only` —
// a legitimate English CV the eval corpus requires to pass — is 0.0016,
// while the code-switched document is 0.0063, four times WIDER. Any cut that
// catches code-switching rejects a real English CV first. The bands overlap,
// so no threshold on that axis separates them.
//
// **What works instead:** judge each segment separately. Mixing is a
// structural property — the languages sit in different paragraphs — and it
// is visible per segment while being invisible in the aggregate.
//
// This layer is **veto-only**. It runs only after the whole-document verdict
// is already English, and it can only ever turn "English" into "refuse". It
// cannot make a non-English document look English, so the eval corpus's
// zero-false-positive property is preserved by construction rather than by
// re-measurement.
// -------------------------------------------------------------------------

/**
 * Minimum words for a SEGMENT to get a verdict. Higher than
 * {@link MIN_WORDS_FOR_JUDGEMENT} on purpose: a skills line ("Skills: Python,
 * Docker, Kubernetes, AWS, React, Git") is 8-12 tokens of language-neutral
 * technology names, and judging it produces a coin flip. Measured false
 * alarms on a held-out ten-CV English corpus spanning nursing, teaching,
 * accountancy, catering, trades, logistics, science, law, admin and haulage:
 *
 *     floor  8w -> 3 of 8 in-corpus English CVs wrongly flagged
 *     floor 10w -> 1 of 10 held-out English CVs wrongly flagged
 *     floor 12w -> 0 wrongly flagged, mixing still caught
 *     floor 15w -> 0 wrongly flagged, mixing still caught   <-- chosen
 *     floor 18w -> 0 wrongly flagged, mixing still caught
 *     floor 20w -> 0 wrongly flagged, but catches NOTHING
 *
 * 15 sits in the middle of the 12-18 window rather than on either edge, so a
 * small corpus change does not flip the behaviour. See
 * `languageDetection.eval.test.ts`, which asserts this sweep rather than
 * describing it.
 */
const MIN_WORDS_FOR_SEGMENT_JUDGEMENT = 15;

/**
 * Segments are taken at TWO granularities and both are judged.
 *
 * Sentence granularity alone is too fine, and the relation `R-L1` in the eval
 * file caught it: a two-sentence Danish, Norwegian or Swedish paragraph
 * splits into 13- and 14-word sentences, both of which fall *below* the word
 * floor and are therefore never judged — even though each is correctly
 * classified non-English when asked, and the 27-word paragraph they form is
 * caught easily. Fragmenting the evidence below the floor discarded it.
 *
 * Paragraph granularity alone is too coarse: a single foreign sentence inside
 * an otherwise-English paragraph is diluted by its neighbours.
 *
 * Judging both and vetoing on either is strictly more sensitive than either
 * one, and stays veto-only, so it cannot introduce a false English verdict.
 */
const PARAGRAPH_BOUNDARY = /\n+/;
const SENTENCE_BOUNDARY = /\n+|(?<=[.!?])\s+/;

/**
 * THIRD granularity: a window over CONSECUTIVE LINES (H-041 remedy, ADR-029).
 *
 * The two granularities above both failed on ordinary CVs, and H-068 measured
 * why: paragraph and sentence boundaries in a CV coincide with the line, CV
 * lines run 8-13 words, the 15-word floor discards every one of them, and
 * `judgedSegmentCount` comes back 0 on most real documents. **This is the same
 * "fragmenting the evidence below the floor discarded it" failure the comment
 * above records — one level up.** Grouping consecutive lines until they clear
 * the floor restores the evidence instead of throwing it away.
 *
 * **Why a sliding line window and not blank-line-delimited runs.** Measured
 * both. Blank-line runs give 0 false refusals but **fail on the PDF path at
 * every foreign proportion below ~49%**, because PDF extraction loses blank
 * lines (H-062/H-065) so the whole document collapses into one run and
 * dilutes. PDF is the dominant real-world format, so that variant is not
 * viable. The line window is format-independent and caught the defect down to
 * 11.2% foreign content on the PDF path.
 */

/**
 * LANGUAGE-NEUTRAL vs LANGUAGE-BEARING (ADR-030, replaces the prose gate).
 *
 * The first attempt at this gated windows on "share of plain lowercase tokens",
 * on the theory that prose is lowercase and header soup is Title Case. **That
 * was English/Romance-biased and German defeated it (H-079):** German
 * capitalises every noun, so a German header line looked like soup, was
 * skipped, and a German-English bilingual header CV was scored.
 *
 * Measuring the replacement found the real root cause, which was not the gate
 * at all. **The 15-WORD floor is itself biased against compounding
 * languages:**
 *
 *     block                words  letters  letters/word
 *     EN header               18      122       6.8
 *     FR header               19      124       6.5
 *     DE header               10      120      12.0
 *     NL header               11      121      11.0
 *     SV header               11      115      10.5
 *
 * All five carry the same amount of text. Only the compounding ones fail a
 * word count, so they were never judged — the gate was a symptom.
 */

/**
 * Window size is measured in LETTERS, not words, so the floor asks for the same
 * amount of text regardless of how a language packages it. 100 letters is the
 * English equivalent of the old 15-word floor (15 x 6.7 measured), chosen so
 * this does not silently loosen the calibrated behaviour for English. 85 also
 * measured clean.
 */
const MIN_LETTERS_FOR_WINDOW = 100;
const MAX_LINES_PER_WINDOW = 12;

/**
 * Function words common across the eight covered languages and rare or absent
 * in English, used as a SUB-FLOOR signal (H-085 remedy).
 *
 * **Why a lexicon here when this module deliberately avoids them.** The
 * n-gram method needs ~8 words to say anything. A foreign insert shorter than
 * the window floor — a single line like "Licenciatura en Ciencias de la
 * Computacion, Universidad de Salamanca", ~70 letters — is never isolated,
 * because any window containing it is mostly English and dilutes. That line
 * carries a DEGREE, which is the attribute that flipped eligibility in the
 * original H-041 reproduction, so the gap is material rather than cosmetic.
 *
 * Measured across all 18 English CVs, per line: requiring **two distinct**
 * hits gives **0 false positives in 70 lines**, while 1 hit gives 1. Two is
 * therefore the floor, and the margin above the false-positive boundary is the
 * whole reason this is safe.
 *
 * **This covers Romance inserts only, by construction.** Germanic
 * compound-noun lines contain no function words at all — measured, 0 hits on
 * German, Dutch and Swedish header lines. **The Germanic sub-floor insert
 * remains open even with `eld` in place (ADR-031, H-092).** Running `eld` at
 * LINE granularity does catch it (13/13), but costs 2/23 real English CVs —
 * a regression the user rejected once already at a cheaper price (H-080) and
 * rejected again here. `eld` was adopted at WINDOW granularity instead, where
 * a line this short never forms a window at all — this is a segmentation gap,
 * not a classifier one, and `languageDetection.eval.test.ts`'s
 * `DOCUMENTED GAP` test asserts it stays open on purpose.
 *
 * Deliberately small and deliberately not a language identifier — it answers
 * only "does this short line carry non-English function words", which is the
 * narrowest question that closes the measured Romance gap.
 */
const NON_ENGLISH_FUNCTION_WORDS = new Set([
  // French
  'de',
  'des',
  'du',
  'les',
  'une',
  'dans',
  'pour',
  'avec',
  'sur',
  'par',
  'est',
  'sont',
  'aux',
  'chez',
  'ses',
  'leur',
  'la',
  'le',
  // Spanish / Italian
  'el',
  'los',
  'las',
  'una',
  'para',
  'con',
  'por',
  'del',
  'su',
  'sus',
  'en',
  'di',
  'della',
  'gli',
  'nel',
  'che',
  // German / Dutch
  'der',
  'die',
  'das',
  'und',
  'mit',
  'von',
  'den',
  'dem',
  'ein',
  'eine',
  'bei',
  'auf',
  'zur',
  'zum',
  'het',
  'een',
  'van',
  'voor',
  'aan',
  'bij',
  'door',
  'naar',
  // Scandinavian
  'och',
  'att',
  'som',
  'till',
  'av',
  'ett',
  'har',
  'hos',
  'og',
  'til',
]);

/** Two distinct hits: measured 0 false positives in 70 English lines; one hit
 *  gives 1, so this margin is the safety. */
const MIN_FUNCTION_WORD_HITS = 2;

const EMAIL_OR_URL = /\S+@\S+|https?:\/\/\S+/g;
const ACRONYM = /^[A-Z][A-Z/&.-]{1,}$/;

/**
 * Removes tokens that carry no language signal — emails, URLs, anything
 * containing a digit, and ALL-CAPS acronyms.
 *
 * Deliberately does NOT remove "anything capitalised": that was the bias in the
 * previous gate. A capitalised word may be a proper noun or may be an ordinary
 * German noun, and this function cannot tell the difference, so it does not
 * try.
 */
function stripNeutralTokens(text: string): string {
  return text
    .replace(EMAIL_OR_URL, ' ')
    .split(/\s+/)
    .filter((t) => t !== '')
    .filter((t) => !/\d/.test(t))
    .filter((t) => !ACRONYM.test(t))
    .join(' ');
}

/** Letters only, so punctuation and spacing cannot inflate a window's size. */
function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length;
}

/**
 * True when a LINE carries enough non-English function words to be foreign,
 * used below the window floor where even `eld` has nothing to judge (H-085).
 */
function carriesNonEnglishFunctionWords(text: string): boolean {
  const distinct = new Set(wordsOf(text).filter((w) => NON_ENGLISH_FUNCTION_WORDS.has(w)));
  return distinct.size >= MIN_FUNCTION_WORD_HITS;
}

export interface NonEnglishSegment {
  /** The offending text, trimmed. */
  readonly text: string;
  /** Offsets into the ORIGINAL document text, so the recruiter can be shown
   *  exactly which part could not be read (PRODUCT_DECISIONS: every claim
   *  links to evidence in the source). */
  readonly sourceSpan: { readonly start: number; readonly end: number };
  /** Closest of the eight covered non-English languages — diagnostic only,
   *  not a language-ID claim (`null` for segments caught by the sub-floor
   *  function-word pass, which does not identify a language). */
  readonly nearestLanguage: NonEnglishLanguage | null;
}

export interface MixedLanguageResult {
  /** true when at least one substantial segment is not English. */
  readonly hasNonEnglishSegment: boolean;
  /** Every offending segment, in document order. */
  readonly nonEnglishSegments: readonly NonEnglishSegment[];
  /** How many segments were long enough to judge at all. **Zero means this
   *  check said nothing** — see the blind spot below. */
  readonly judgedSegmentCount: number;
}

interface TextSegment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** true when this segment already cleared a size floor of its own, so the
   *  word-based floor must not re-reject it (ADR-030). */
  readonly floorCleared?: boolean;
}

/** Splits on one boundary while keeping offsets into the original text valid.
 *  Offsets are recovered by scanning forward rather than by summing lengths,
 *  so the separators the split consumed cannot shift them. */
function splitWithOffsets(text: string, boundary: RegExp): TextSegment[] {
  const found: TextSegment[] = [];
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

/** Non-blank lines with their offsets into the original text. */
function linesWithOffsets(text: string): TextSegment[] {
  const found: TextSegment[] = [];
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

/**
 * Windows over consecutive lines, each grown until it clears the word floor.
 *
 * Sized in LETTERS (see {@link MIN_LETTERS_FOR_WINDOW}) so the floor asks for
 * the same amount of text from a compounding language as from English. Windows
 * carry `floorCleared` so the word-based floor in
 * {@link findNonEnglishSegments} does not re-reject them — applying both would
 * reinstate exactly the bias this replaced (H-079).
 */
function lineWindows(text: string): TextSegment[] {
  const lines = linesWithOffsets(text);
  const found: TextSegment[] = [];

  for (let i = 0; i < lines.length; i++) {
    for (let j = i; j < lines.length && j - i < MAX_LINES_PER_WINDOW; j++) {
      const first = lines[i];
      const last = lines[j];
      if (first === undefined || last === undefined) break;

      const slice = text.slice(first.start, last.end);
      if (letterCount(stripNeutralTokens(slice)) < MIN_LETTERS_FOR_WINDOW) continue;

      // Cleared the floor: this is the window for `i`. Stop growing — a longer
      // window would dilute whatever makes this one distinctive.
      found.push({ text: slice, start: first.start, end: last.end, floorCleared: true });
      break;
    }
  }

  return found;
}

/** Segments at all three granularities, de-duplicated by span so a
 *  single-sentence paragraph is judged once rather than twice. */
function segmentsOf(text: string): TextSegment[] {
  const bySpan = new Map<string, TextSegment>();

  for (const segment of [
    ...splitWithOffsets(text, PARAGRAPH_BOUNDARY),
    ...splitWithOffsets(text, SENTENCE_BOUNDARY),
    ...lineWindows(text),
  ]) {
    bySpan.set(`${String(segment.start)}:${String(segment.end)}`, segment);
  }

  return [...bySpan.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Finds substantial segments that are not English, for use as a refusal veto
 * on a document the whole-document check already called English (ADR-022).
 *
 * **BLIND SPOT — CLASSIFIED WRONG-SCORE, BLOCKS THE GATE (ADR-027, H-069).**
 * This check is silent on ANY document whose lines fall below the 15-word
 * floor — `judgedSegmentCount` comes back 0 and nothing is judged. Ordinary CV
 * lines run 8-13 words, so that is most real CVs, **not just terse ones**.
 * A partly-non-English CV is therefore scored on its English part.
 *
 * Measured, same candidate and same facts, earlier role and degree translated:
 *
 *     stated in Spanish   totalYearsExperience 4.8   score  56, ineligible
 *     stated in English   totalYearsExperience 9.1   score 100, eligible
 *
 * and the recruiter is shown "Requires at least 9 years of experience; found
 * 4.8" — fabricated evidence about a real person, with `warnings: []`.
 *
 * The trigger is segment LENGTH, not proportion: the same French text as two
 * 9-word lines is scored, joined into one 18-word line it is refused. The
 * whole-document backstop is language-dependent and weaker than assumed — a
 * **53.3% Spanish** document still classified English.
 *
 * Four of the ten held-out English CVs have no judgeable segment at all. (An
 * earlier revision of this comment said five; the eval asserts four — H-072.)
 *
 * Closing this needs per-segment detection that works on ~8-word fragments,
 * which this method cannot do, OR refusal when the veto abstained. **The
 * remediation is not yet chosen and the floor is not a free parameter:** 12-18
 * is the measured window, 20 catches nothing, 10 falsely refuses a real CV.
 *
 * **R-L1 does not pin this** (H-070, E2 NOT MET): it generates the CV, the
 * language and the insertion position, but draws foreign text from a fixed set
 * of paragraphs that all clear the floor by construction.
 */
export function findNonEnglishSegments(text: string): MixedLanguageResult {
  const nonEnglishSegments: NonEnglishSegment[] = [];
  let judgedSegmentCount = 0;

  for (const segment of segmentsOf(text)) {
    // Judge the language-BEARING part. Emails, URLs, numbers and acronyms are
    // the same strings in every language and only add noise to a profile
    // comparison (ADR-030).
    const bearing = stripNeutralTokens(segment.text);
    const verdict = detectLanguageHeuristic(bearing);

    // `isEnglish === null` means the segment was below the detector's own
    // floor. `floorCleared` segments already passed a letter-based floor, so
    // re-applying the word floor to them would reinstate the bias against
    // compounding languages that H-079 recorded.
    if (verdict.isEnglish === null) continue;
    if (segment.floorCleared !== true && verdict.wordCount < MIN_WORDS_FOR_SEGMENT_JUDGEMENT)
      continue;

    judgedSegmentCount++;

    // `verdict.isEnglish` is narrowed to boolean here — the null case already
    // continued above. Trusting `eld`'s verdict directly, with no separate
    // morphology signal or confidence margin, is the ADR-031 change: those
    // existed only to patch the old n-gram profiler's blind spots (it
    // mis-scored German compound-noun lines as English outright, and produced
    // coin-flip margins on language-neutral text). Measured clean at this
    // window granularity — see `languageDetection.eval.test.ts` — with no
    // regression on the Indian-English institution-name corpus that made the
    // old morphology signal need an exemption in the first place (H-086).
    if (verdict.isEnglish) continue;

    nonEnglishSegments.push({
      text: segment.text,
      sourceSpan: { start: segment.start, end: segment.end },
      nearestLanguage: verdict.nearestOtherLanguage,
    });
  }

  // SUB-FLOOR PASS (H-085). Everything above operates on windows of ~100+
  // letters. A foreign insert shorter than that is never isolated, because any
  // window containing it is mostly English and dilutes — measured, a one-line
  // Spanish degree was scored. This pass looks at individual lines for
  // non-English function words, which is the one signal that survives at 5-8
  // words.
  //
  // Veto-only, like everything else here: it can add refusals and can never
  // manufacture an English verdict.
  for (const line of linesWithOffsets(text)) {
    if (!carriesNonEnglishFunctionWords(line.text)) continue;
    const alreadyReported = nonEnglishSegments.some(
      (s) => s.sourceSpan.start <= line.start && s.sourceSpan.end >= line.end,
    );
    if (alreadyReported) continue;

    nonEnglishSegments.push({
      text: line.text,
      sourceSpan: { start: line.start, end: line.end },
      // The lexicon spans eight languages and deliberately does not identify
      // which one, so this reports no nearest language rather than guessing.
      nearestLanguage: null,
    });
  }

  return {
    hasNonEnglishSegment: nonEnglishSegments.length > 0,
    nonEnglishSegments,
    judgedSegmentCount,
  };
}
