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
 * `languageDetection.eval.test.ts`.
 *
 * **H-041 is NARROWED by the sub-floor line pass below, not closed.** The
 * swap itself does nothing for it; {@link lineReadsNonEnglish} does. That
 * pass took the sub-floor class from Romance-only (the 8-language
 * function-word lexicon) to eleven of twenty-six measured foreign lines
 * across fifteen languages, at zero cost to English recall. What remains is
 * a foreign line of five or fewer bearing words, and the `DOCUMENTED GAP`
 * tests assert it stays open on purpose. **The residual is a word count, not
 * a language family** — the "Germanic" framing was falsified by measurement
 * (H-105).
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
 *
 * **H-106: this lexicon refused ordinary English (defect, fixed here).**
 * `van`, `door`, `die`, `den`, `est`, `con` and `par` are ordinary English
 * words (a delivery van, a door, a press die, a den, "est. 1994", "pros and
 * cons", "on par with") that also happen to be French/German/Dutch function
 * words. Two of them on one line refused the whole document. An adversarial
 * round of 17 realistic lines — the 7 in the H-106 report plus 10 more
 * constructed independently across every domain this module's own comment
 * names (nursing, teaching, accountancy, catering, trades, logistics,
 * science, law, admin, haulage) — found 15/17 falsely refused before the fix
 * below; see `languageDetection.eval.test.ts`'s H-106 describe block.
 *
 * **Fix 1 — removed the seven ordinary-English-word tokens above.** Measured
 * zero cost: neither closed Romance sub-floor test (H-087, the Spanish
 * degree line and the French insert line) contains any of them, and the
 * Germanic entries among them (`van`, `door`, `die`, `den`) were already
 * inert for the one Germanic case this lexicon is measured against — H-087
 * itself records "Germanic compound-noun lines contain no function words at
 * all", so removing four Germanic tokens costs nothing already being caught.
 *
 * **Fix 2 — kept `el`, `los`, `la`, `le`, `de` but require the ORIGINAL token
 * to be lowercase to count.** These five are genuine, common Romance
 * function words ("en", "de", "la" carry the Spanish sub-floor catch on
 * their own) but are also how English spells foreign proper nouns ("El
 * Paso", "Los Angeles", "Le Gavroche", "Chef de Partie", "De Pere") — always
 * capitalised when they are a proper noun, because English capitalises
 * proper nouns and Romance languages do not capitalise mid-sentence function
 * words. Removing them outright would have cost the French sub-floor test
 * (it has exactly two hits, "une" and "de" — losing "de" drops it to one and
 * the catch is lost); the case restriction costs nothing measured instead,
 * because "de"/"la"/"en" appear lowercase in both closed Romance fixtures.
 *
 * **Rejected: raising `MIN_FUNCTION_WORD_HITS` to 3.** Measured directly:
 * the closed French sub-floor line ("Encadrement d une equipe de six
 * personnes") has exactly two distinct hits ("une", "de"). A threshold of 3
 * loses that catch outright, so this was not a viable lever here — the fix
 * had to come from the lexicon, not the count.
 *
 * **Residual, stated rather than chased.** A short line combining two of the
 * remaining lowercase Romance tokens can still trip this — e.g. a founding
 * date abbreviation ("est. 1998") on the same short line as the Latin legal
 * phrase "de novo" ("est" + "de", both lowercase) is a contrived but
 * possible law-domain line. Not observed in the 23-CV corpus or the 17-line
 * adversarial set; flagged rather than engineered around, because
 * special-casing an invented two-word combination risks the same
 * over-fitting this fix exists to correct.
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
  'das',
  'und',
  'mit',
  'von',
  'dem',
  'ein',
  'eine',
  'bei',
  'auf',
  'zur',
  'zum',
  'het',
  'een',
  'voor',
  'aan',
  'bij',
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
 *  gives 1, so this margin is the safety. Raising this to 3 was measured and
 *  rejected (see the lexicon comment above) — it loses the closed French
 *  sub-floor catch, which has exactly two hits. */
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

/** Word tokens with case PRESERVED (unlike {@link wordsOf}), so a capitalised
 *  form can be told apart from a lowercase one. Used only by
 *  {@link carriesNonEnglishFunctionWords}'s proper-noun guard. */
const CASED_WORD = /[\p{L}']+/gu;

/**
 * True when a LINE carries enough non-English function words to be foreign,
 * used below the window floor where even `eld` has nothing to judge (H-085).
 *
 * Runs `stripNeutralTokens` first (H-106) — this scan is language-BEARING
 * text just like the window pass above, so emails, URLs, digit-bearing
 * tokens and ALL-CAPS acronyms must not count here either. And it only
 * counts a lexicon hit whose ORIGINAL token was lowercase, so a proper noun
 * spelled with a foreign-looking word ("El Paso", "Le Gavroche") does not
 * count as a function word (H-106) — see the lexicon's doc comment for what
 * this costs and does not cost.
 */
function carriesNonEnglishFunctionWords(text: string): boolean {
  const bearing = stripNeutralTokens(text);
  const tokens = bearing.match(CASED_WORD) ?? [];
  const distinct = new Set(
    tokens
      .filter((t) => /^\p{Ll}/u.test(t))
      .map((t) => t.toLowerCase())
      .filter((t) => NON_ENGLISH_FUNCTION_WORDS.has(t)),
  );
  return distinct.size >= MIN_FUNCTION_WORD_HITS;
}

/**
 * Minimum language-BEARING words before `eld` is allowed to judge a single
 * line (H-041). Below this the classifier is not so much wrong as guessing,
 * and what it guesses on is a CV's proper nouns and technology lists.
 *
 * **Measured, against 258 English lines and 26 short foreign lines in 15
 * languages.** The English pool is every line of all 23 English CVs, every
 * line of the fixture corpus, hand-written lines across the ten professions
 * the corpus names, and 18 technology/qualification lists:
 *
 * ```
 *   floor   English refused   foreign caught
 *   W>=5         2/258             17/26
 *   W>=6         0/258             11/26
 *   W>=7         0/258              4/26
 * ```
 *
 * **The floor was raised twice by measurement, both times because the pool
 * was missing a population.** At 4 it refuses `"Giovanni Esposito - Sous
 * Chef"` and `"Nguyen Thi Minh Anh"` — a candidate's NAME, which is the
 * H-028 D3 shape this project records as a discrimination risk and not merely
 * an accuracy one. At 5 it refuses `"Java, Spring Boot, PostgreSQL, Docker,
 * AWS"` and `"AutoCAD, STAAD.Pro, Project Management"` — language-neutral
 * technology lists, caught only when the fixture corpus was added to the
 * pool. Both are H-022's shape, and both were found by widening the corpus
 * rather than by argument.
 *
 * **Lowering it is a decision for the user, not a tuning knob**, because what
 * it buys recall with is refusing CVs on the basis of the candidate's name.
 */
const MIN_BEARING_WORDS_FOR_LINE_JUDGEMENT = 6;

/**
 * Whether a single LINE reads as non-English to `eld` (H-041).
 *
 * The sub-floor pass below this used to be the function-word lexicon alone,
 * which spans eight languages and therefore closed Romance and nothing else —
 * H-105 measured German, Polish, Turkish, Romanian, Indonesian, Czech and
 * Portuguese degree lines all being SCORED, each one telling a recruiter that
 * a graduate has no degree. That is why "the residual is Germanic" was wrong.
 *
 * This adds `eld` at line granularity, which is language-general, gated on two
 * things and no thresholds beyond them: enough bearing text to judge
 * ({@link MIN_BEARING_WORDS_FOR_LINE_JUDGEMENT}), and `eld`'s OWN reliability
 * flag.
 *
 * **The floor is a parameter because its right value depends on what else
 * gates the call.** The document-wide veto below passes the default 6, which
 * is where the cost of judging arbitrary lines reaches zero. The
 * section-scoped caller in `unreadableSections.ts` passes 2, because
 * restricting to lines INSIDE a recognised section already excludes the header
 * block where names live — and names, not short lines, were what made a low
 * floor unsafe (H-112).
 *
 * **A confidence margin was measured and rejected**, as was an absolute-score
 * cut: the classes genuinely overlap, so neither separates them. A real Dutch
 * line scores 0.109 above English while `"Kwabena Boateng - HGV Driver"`
 * scores 0.115; a real German line scores 0.601 absolute while the same
 * English line scores 0.664. There is no threshold on `eld`'s output that
 * does this job, which is why the gate is on the INPUT instead.
 *
 * **The lexicon is kept, not replaced.** It fires below this floor, where
 * `eld` is not allowed to speak, and it costs 0/258 (H-106). Deleting it
 * would lose the sub-floor Romance catches with nothing to replace them —
 * H-092 reached the same conclusion and said so.
 */
export function lineReadsNonEnglish(
  text: string,
  minBearingWords: number = MIN_BEARING_WORDS_FOR_LINE_JUDGEMENT,
): boolean {
  const bearing = stripNeutralTokens(text);
  const words = bearing.match(CASED_WORD) ?? [];
  if (words.length < minBearingWords) return false;

  const detection = eld.detect(bearing);
  // `eld` returns an empty string when it will not commit to a language; that
  // is an abstention, not a foreign verdict, and must not become a refusal.
  if (detection.language === '' || detection.language === 'en') return false;
  return detection.isReliable();
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
    // Two independent signals, unioned. The lexicon survives below the
    // 5-word floor where `eld` is not allowed to speak, and `eld` covers the
    // languages a 60-word lexicon never could. Neither is a threshold on the
    // other's output; deleting either loses measured recall (H-092, H-041).
    if (!carriesNonEnglishFunctionWords(line.text) && !lineReadsNonEnglish(line.text)) continue;
    const alreadyReported = nonEnglishSegments.some(
      (s) => s.sourceSpan.start <= line.start && s.sourceSpan.end >= line.end,
    );
    if (alreadyReported) continue;

    nonEnglishSegments.push({
      text: line.text,
      sourceSpan: { start: line.start, end: line.end },
      // Neither signal reports WHICH language: the lexicon spans eight and
      // does not distinguish them, and `eld`'s pick at line granularity is
      // reliable enough to say "not English" without being worth quoting to a
      // recruiter as a positive identification. ADR-006 needs English-vs-not.
      nearestLanguage: null,
    });
  }

  return {
    hasNonEnglishSegment: nonEnglishSegments.length > 0,
    nonEnglishSegments,
    judgedSegmentCount,
  };
}
