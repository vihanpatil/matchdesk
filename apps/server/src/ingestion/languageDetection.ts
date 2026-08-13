/**
 * Deterministic English-vs-not language detector (ADR-006: non-English CVs
 * are never scored — `all-MiniLM-L6-v2` and the rule-based extraction are
 * both English-only, so a confident score on a non-English document would
 * be C7's exact failure: a confident, meaningless number).
 *
 * **Replaces the stopword-ratio heuristic (H-023 / H-028 D6).** The
 * stopword cut failed because it measured only whitespace-delimited
 * function words, and several of English's commonest function words
 * ("in", "on", "an", "a", "i", "for") are *also* common tokens in French,
 * German and the Scandinavian languages — either as their own function
 * words or as short inflections. That put a real English CV *below* French,
 * German and Scandinavian samples on the exact axis being thresholded; the
 * classes were never separated, so no threshold could have worked.
 *
 * **Method: character n-gram profiling (Cavnar & Trenkle, "N-Gram-Based
 * Text Categorization", 1994).** For each language, count how often every
 * word-padded character n-gram (n = 1..4) occurs across a reference corpus
 * and keep the most frequent {@link PROFILE_SIZE}, ranked by frequency —
 * that ranked list is the language's "profile". A profile captures far more
 * than function words: letter frequency, common digraphs/trigraphs,
 * diacritics, and — because n-grams are taken from *padded* words —
 * word-initial and word-final morphology (English "-ing"/"-tion", French
 * "-ment"/"-eux", German "-ung"/"-chen", Scandinavian "-else"/"-het", …).
 * That is what a pure stopword count cannot see and what makes this
 * approach hold up on text with few or no function words.
 *
 * The input document gets its own ranked profile the same way, and is
 * compared against each reference profile with the standard "out-of-place"
 * distance: for every n-gram in the input's top {@link PROFILE_SIZE}, add
 * the absolute difference between its rank in the input and its rank in the
 * reference (or a fixed penalty if the reference never saw it at all).
 * Lower distance = more similar. The document is classified English only
 * when its distance to the English profile is strictly lower than its
 * distance to the *closest* of the eight non-English reference profiles —
 * i.e. English has to actually win the comparison, not merely clear a fixed
 * bar.
 *
 * Deterministic, dependency-free (no npm package, no network, no model
 * weights) — the reference profiles are built once, synchronously, from the
 * hand-authored corpora below, every time this module loads.
 *
 * **Honest limitations, stated per Section 0.1 / ADR-006:**
 * - The reference corpora are ~150-word hand-authored paragraphs per
 *   language, not a mined corpus of thousands of documents. This gives each
 *   language a real, distinctive profile, but the profiles are narrower
 *   than a production language-ID model's — see
 *   `apps/server/src/ingestion/languageDetection.eval.test.ts` for the
 *   measured confusion matrix this produces on a held-out CV-shaped corpus,
 *   reported honestly rather than tuned to pass.
 * - Only distinguishes "recognizably English" from "one of the eight
 *   covered non-English languages" (French, German, Spanish, Italian,
 *   Dutch, Danish, Norwegian, Swedish); it was not built or tested to
 *   identify *which* language a non-English document is in, nor to handle
 *   non-Latin scripts (Cyrillic, CJK, Arabic, …) — those will simply score
 *   far from every reference profile, which in practice still yields
 *   `isEnglish: false` (extremely large distance to English), but that
 *   behaviour is a side effect, not a designed guarantee.
 * - Short documents (see {@link MIN_WORDS_FOR_JUDGEMENT}) do not carry
 *   enough signal to judge either way; the result is `isEnglish: null`
 *   ("unknown"), which callers must treat the same as "do not score" —
 *   silence is not evidence of English.
 * - A CV that is almost entirely proper nouns and technology names shared
 *   verbatim across languages ("Python", "Docker", "AWS", "Kubernetes") is
 *   the hardest case for *any* character-statistics approach, English or
 *   not: those tokens are near-identical strings in every language's CV.
 *   Real CVs of this shape still carry enough surrounding structure
 *   (section headers, connective phrasing, verb endings) to separate
 *   correctly in the measured eval set, but a document that is *purely* a
 *   comma-separated technology list with zero structural English text is a
 *   genuine edge the corpus-based approach cannot promise to get right —
 *   flagged rather than papered over.
 * - A bilingual or code-switched document (e.g. an English CV with a French
 *   cover paragraph) is scored as one blob of text; the verdict reflects
 *   whichever language's statistics dominate the combined n-gram counts,
 *   not a per-section judgement.
 */

/** Below this token count, there is not enough text to judge either way. */
const MIN_WORDS_FOR_JUDGEMENT = 8;

/** How many top-ranked n-grams make up a language profile. */
const PROFILE_SIZE = 300;

/** Character n-gram lengths pooled into one ranked profile (word-padded). */
const MIN_N = 1;
const MAX_N = 4;

/** Cavnar & Trenkle's fixed penalty for an n-gram absent from a reference
 *  profile — conventionally the profile size itself. */
const MAX_PENALTY = PROFILE_SIZE;

/** Non-English languages this detector is trained to recognize as "not
 *  English" (ADR-006 only requires English-vs-not, not identifying which
 *  language a non-English document is in). */
const NON_ENGLISH_LANGUAGES = ['fr', 'de', 'es', 'it', 'nl', 'da', 'no', 'sv'] as const;
type NonEnglishLanguage = (typeof NON_ENGLISH_LANGUAGES)[number];

/**
 * Reference corpora: ~150-word original, hand-authored paragraphs
 * describing a generic software-engineering career (matching the CV
 * domain this detector is used for), one per language. Written
 * independently of the evaluation fixtures in
 * `languageDetection.eval.test.ts` and `extractText.test.ts` so the
 * profiles are not fitted to the documents that grade them.
 */
const LANGUAGE_TRAINING_TEXT: Record<'en' | NonEnglishLanguage, string> = {
  en: 'This document describes a professional background in software engineering. The candidate has several years of experience building and maintaining web applications, working with modern programming languages and cloud infrastructure. Responsibilities have included designing systems, reviewing code, mentoring junior colleagues and collaborating closely with product and design teams. Skills include strong communication, problem solving and a solid understanding of databases, testing and deployment pipelines. The individual holds a university degree and has completed additional professional certifications. Previous roles were held at technology companies of varying size, ranging from small startups to large established firms. Day to day work involves planning, implementing, testing and shipping features, as well as fixing defects reported by users. Strong attention to detail and a collaborative attitude are valued highly in every team the candidate has joined.',
  fr: "Ce document décrit un parcours professionnel dans le domaine du génie logiciel. Le candidat possède plusieurs années d'expérience dans la conception et la maintenance d'applications web, en travaillant avec des langages de programmation modernes et une infrastructure infonuagique. Les responsabilités ont inclus la conception de systèmes, la révision de code, l'encadrement de collègues juniors et la collaboration étroite avec les équipes de produit et de design. Les compétences comprennent une forte communication, la résolution de problèmes et une bonne compréhension des bases de données, des tests et des chaînes de déploiement. La personne est titulaire d'un diplôme universitaire et a suivi des certifications professionnelles supplémentaires. Les postes précédents ont été occupés dans des entreprises technologiques de tailles variées, allant de petites entreprises en démarrage à de grandes entreprises établies. Le travail quotidien comprend la planification, la mise en œuvre, les tests et la livraison de fonctionnalités, ainsi que la correction des anomalies signalées par les utilisateurs.",
  de: 'Dieses Dokument beschreibt einen beruflichen Werdegang im Bereich der Softwareentwicklung. Die Kandidatin verfügt über mehrere Jahre Erfahrung in der Entwicklung und Wartung von Webanwendungen und arbeitet mit modernen Programmiersprachen und Cloud-Infrastruktur. Zu den Aufgaben gehörten der Entwurf von Systemen, die Überprüfung von Quellcode, die Betreuung jüngerer Kolleginnen und die enge Zusammenarbeit mit den Produkt- und Designteams. Zu den Fähigkeiten zählen starke Kommunikation, Problemlösung sowie ein solides Verständnis von Datenbanken, Tests und Bereitstellungsprozessen. Die Person besitzt einen Hochschulabschluss und hat zusätzliche berufliche Zertifizierungen abgeschlossen. Frühere Positionen wurden bei Technologieunternehmen unterschiedlicher Größe wahrgenommen, von kleinen Neugründungen bis hin zu großen etablierten Firmen. Die tägliche Arbeit umfasst Planung, Umsetzung, Tests und die Auslieferung neuer Funktionen sowie die Behebung von Fehlern, die von Nutzern gemeldet wurden.',
  es: 'Este documento describe una trayectoria profesional en el ámbito de la ingeniería de software. El candidato cuenta con varios años de experiencia en el diseño y mantenimiento de aplicaciones web, trabajando con lenguajes de programación modernos e infraestructura en la nube. Las responsabilidades incluyeron el diseño de sistemas, la revisión de código, la orientación de compañeros junior y la colaboración estrecha con los equipos de producto y diseño. Las habilidades incluyen una fuerte comunicación, la resolución de problemas y una buena comprensión de bases de datos, pruebas y procesos de despliegue. La persona posee un título universitario y ha completado certificaciones profesionales adicionales. Los puestos anteriores se ocuparon en empresas tecnológicas de diferentes tamaños, desde pequeñas empresas emergentes hasta grandes compañías establecidas. El trabajo diario incluye planificación, implementación, pruebas y entrega de funciones, además de la corrección de errores reportados por los usuarios.',
  it: "Questo documento descrive un percorso professionale nell'ambito dell'ingegneria del software. Il candidato possiede diversi anni di esperienza nella progettazione e nella manutenzione di applicazioni web, lavorando con linguaggi di programmazione moderni e infrastrutture in cloud. Le responsabilità hanno incluso la progettazione di sistemi, la revisione del codice, l'affiancamento di colleghi junior e la stretta collaborazione con i team di prodotto e design. Le competenze comprendono una forte comunicazione, la risoluzione dei problemi e una buona comprensione di basi di dati, test e processi di distribuzione. La persona possiede una laurea universitaria e ha completato ulteriori certificazioni professionali. I ruoli precedenti sono stati ricoperti presso aziende tecnologiche di dimensioni diverse, da piccole start-up a grandi aziende affermate. Il lavoro quotidiano comprende la pianificazione, l'implementazione, i test e il rilascio di funzionalità, oltre alla correzione di difetti segnalati dagli utenti.",
  nl: "Dit document beschrijft een professionele achtergrond op het gebied van softwareontwikkeling. De kandidaat heeft meerdere jaren ervaring met het bouwen en onderhouden van webapplicaties en werkt met moderne programmeertalen en cloudinfrastructuur. De verantwoordelijkheden omvatten het ontwerpen van systemen, het beoordelen van code, het begeleiden van jongere collega's en nauwe samenwerking met de product- en designteams. Vaardigheden omvatten sterke communicatie, probleemoplossing en een goed begrip van databases, testen en implementatieprocessen. De persoon heeft een universitaire graad behaald en aanvullende professionele certificeringen afgerond. Eerdere functies werden vervuld bij technologiebedrijven van verschillende grootte, van kleine startups tot grote gevestigde bedrijven. Het dagelijkse werk omvat plannen, bouwen, testen en het uitleveren van functies, evenals het oplossen van fouten die door gebruikers zijn gemeld.",
  da: 'Dette dokument beskriver en professionel baggrund inden for softwareudvikling. Kandidaten har flere års erfaring med at bygge og vedligeholde webapplikationer og arbejder med moderne programmeringssprog og skyinfrastruktur. Ansvarsområderne har omfattet design af systemer, gennemgang af kode, oplæring af yngre kolleger og tæt samarbejde med produkt- og designteams. Færdighederne omfatter stærk kommunikation, problemløsning og en god forståelse af databaser, test og udrulningsprocesser. Personen har en universitetsgrad og har gennemført yderligere professionelle certificeringer. Tidligere stillinger har været hos teknologivirksomheder af forskellig størrelse, fra små nystartede virksomheder til store etablerede firmaer. Det daglige arbejde omfatter planlægning, implementering, test og levering af nye funktioner samt rettelse af fejl rapporteret af brugere.',
  no: 'Dette dokumentet beskriver en profesjonell bakgrunn innen programvareutvikling. Kandidaten har flere års erfaring med å bygge og vedlikeholde webapplikasjoner og arbeider med moderne programmeringsspråk og skyinfrastruktur. Ansvarsområdene har omfattet design av systemer, gjennomgang av kode, opplæring av yngre kolleger og tett samarbeid med produkt- og designteam. Ferdighetene omfatter sterk kommunikasjon, problemløsning og en god forståelse av databaser, testing og utrullingsprosesser. Personen har en universitetsgrad og har fullført ytterligere profesjonelle sertifiseringer. Tidligere stillinger har vært hos teknologiselskaper av ulik størrelse, fra små oppstartsselskaper til store etablerte firmaer. Det daglige arbeidet omfatter planlegging, implementering, testing og levering av nye funksjoner, samt retting av feil rapportert av brukere.',
  sv: 'Detta dokument beskriver en professionell bakgrund inom mjukvaruutveckling. Kandidaten har flera års erfarenhet av att bygga och underhålla webbapplikationer och arbetar med moderna programmeringsspråk och molninfrastruktur. Ansvarsområdena har omfattat design av system, granskning av kod, handledning av yngre kollegor och nära samarbete med produkt- och designteam. Färdigheterna omfattar stark kommunikation, problemlösning och en god förståelse för databaser, testning och utrullningsprocesser. Personen har en universitetsexamen och har genomfört ytterligare professionella certifieringar. Tidigare tjänster har innehafts hos teknikföretag av olika storlek, från små nystartade företag till stora etablerade företag. Det dagliga arbetet omfattar planering, implementering, testning och leverans av nya funktioner, samt rättelse av fel som rapporterats av användare.',
};

/** Word tokens: runs of Unicode letters and apostrophes (keeps contractions
 *  like "d'expérience" and "colleague's" as single tokens). */
function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
}

/** All n-grams (n = minN..maxN) of one word, padded with a single boundary
 *  space on each side so word-initial/word-final n-grams are distinct from
 *  mid-word ones (Cavnar & Trenkle's padding convention). */
function ngramsOfWord(word: string, minN: number, maxN: number): string[] {
  const padded = ` ${word} `;
  const grams: string[] = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= padded.length; i++) {
      grams.push(padded.slice(i, i + n));
    }
  }
  return grams;
}

function ngramCounts(text: string, minN: number, maxN: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of wordsOf(text)) {
    for (const gram of ngramsOfWord(word, minN, maxN)) {
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  }
  return counts;
}

/** Ranks n-grams by descending frequency, breaking ties lexicographically
 *  so the profile is fully deterministic regardless of Map iteration order. */
function rankedProfile(counts: Map<string, number>, size: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, size)
    .map(([gram]) => gram);
}

/** Cavnar & Trenkle "out-of-place" distance: lower means more similar. Every
 *  n-gram in `inputProfile` contributes the absolute difference between its
 *  rank there and its rank in `referenceProfile`, or `maxPenalty` if the
 *  reference profile never saw that n-gram at all. */
function outOfPlaceDistance(
  inputProfile: readonly string[],
  referenceProfile: readonly string[],
  maxPenalty: number,
): number {
  const referenceRank = new Map(referenceProfile.map((gram, i) => [gram, i]));
  let distance = 0;
  for (const [inputRank, gram] of inputProfile.entries()) {
    const refRank = referenceRank.get(gram);
    distance += refRank === undefined ? maxPenalty : Math.abs(inputRank - refRank);
  }
  return distance;
}

function buildProfile(text: string): string[] {
  return rankedProfile(ngramCounts(text, MIN_N, MAX_N), PROFILE_SIZE);
}

/** Built once, synchronously, at module load — deterministic and cheap
 *  (~150 words per language, no I/O, no async work). */
const LANGUAGE_PROFILES: Record<'en' | NonEnglishLanguage, readonly string[]> = {
  en: buildProfile(LANGUAGE_TRAINING_TEXT.en),
  fr: buildProfile(LANGUAGE_TRAINING_TEXT.fr),
  de: buildProfile(LANGUAGE_TRAINING_TEXT.de),
  es: buildProfile(LANGUAGE_TRAINING_TEXT.es),
  it: buildProfile(LANGUAGE_TRAINING_TEXT.it),
  nl: buildProfile(LANGUAGE_TRAINING_TEXT.nl),
  da: buildProfile(LANGUAGE_TRAINING_TEXT.da),
  no: buildProfile(LANGUAGE_TRAINING_TEXT.no),
  sv: buildProfile(LANGUAGE_TRAINING_TEXT.sv),
};

export interface LanguageDetectionResult {
  /** true = judged English, false = judged not English, null = not enough
   *  text to judge either way. */
  isEnglish: boolean | null;
  /** Total alphabetic word tokens considered. */
  wordCount: number;
  /** Out-of-place distance to the English reference profile (lower = more
   *  English-like). `null` when there was not enough text to judge. */
  distanceToEnglish: number | null;
  /** Out-of-place distance to the closest non-English reference profile.
   *  `null` when there was not enough text to judge. */
  distanceToNearestOther: number | null;
  /** Which non-English reference profile was closest (diagnostic only —
   *  this detector does not claim to identify the language, only that it
   *  was the best match among the eight covered). `null` when there was
   *  not enough text to judge. */
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

  const inputProfile = buildProfile(text);
  const distanceToEnglish = outOfPlaceDistance(inputProfile, LANGUAGE_PROFILES.en, MAX_PENALTY);

  let distanceToNearestOther = Infinity;
  let nearestOtherLanguage: NonEnglishLanguage | null = null;
  for (const lang of NON_ENGLISH_LANGUAGES) {
    const distance = outOfPlaceDistance(inputProfile, LANGUAGE_PROFILES[lang], MAX_PENALTY);
    if (distance < distanceToNearestOther) {
      distanceToNearestOther = distance;
      nearestOtherLanguage = lang;
    }
  }

  return {
    isEnglish: distanceToEnglish < distanceToNearestOther,
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

/** Segment boundaries: blank/new lines, or sentence-ending punctuation. CV
 *  structure is line-oriented, and a code-switched block is a paragraph or a
 *  run of sentences — never half a sentence. */
const SEGMENT_BOUNDARY = /\n+|(?<=[.!?])\s+/;

export interface NonEnglishSegment {
  /** The offending text, trimmed. */
  readonly text: string;
  /** Offsets into the ORIGINAL document text, so the recruiter can be shown
   *  exactly which part could not be read (PRODUCT_DECISIONS: every claim
   *  links to evidence in the source). */
  readonly sourceSpan: { readonly start: number; readonly end: number };
  /** Closest reference profile — diagnostic only, not a language-ID claim. */
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
}

/** Splits into segments while keeping offsets into the original text valid.
 *  Offsets are recovered by scanning forward rather than by summing lengths,
 *  so the separators the split consumed cannot shift them. */
function segmentsOf(text: string): TextSegment[] {
  const found: TextSegment[] = [];
  let cursor = 0;

  for (const piece of text.split(SEGMENT_BOUNDARY)) {
    const trimmed = piece.trim();
    if (trimmed.length === 0) continue;

    const start = text.indexOf(trimmed, cursor);
    if (start === -1) continue;

    found.push({ text: trimmed, start, end: start + trimmed.length });
    cursor = start + trimmed.length;
  }

  return found;
}

/**
 * Finds substantial segments that are not English, for use as a refusal veto
 * on a document the whole-document check already called English (ADR-022).
 *
 * **Blind spot, stated rather than discovered later:** on a terse CV — pure
 * bullets, skills lists, header-and-technology layouts — no segment reaches
 * the word floor, `judgedSegmentCount` is 0, and this check is silent. Five
 * of the ten held-out English CVs are that shape. A terse BILINGUAL CV
 * therefore still passes. This narrows the C7 gap; it does not close it, and
 * closing it needs per-segment detection that works on ~8-word fragments,
 * which this method cannot do (see the eval file's measured limitation).
 */
export function findNonEnglishSegments(text: string): MixedLanguageResult {
  const nonEnglishSegments: NonEnglishSegment[] = [];
  let judgedSegmentCount = 0;

  for (const segment of segmentsOf(text)) {
    const verdict = detectLanguageHeuristic(segment.text);

    // `isEnglish === null` means the segment was below the detector's own
    // floor; the separate, higher segment floor keeps short technology lines
    // out of the vote entirely.
    if (verdict.isEnglish === null) continue;
    if (verdict.wordCount < MIN_WORDS_FOR_SEGMENT_JUDGEMENT) continue;

    judgedSegmentCount++;
    if (verdict.isEnglish) continue;

    nonEnglishSegments.push({
      text: segment.text,
      sourceSpan: { start: segment.start, end: segment.end },
      nearestLanguage: verdict.nearestOtherLanguage,
    });
  }

  return {
    hasNonEnglishSegment: nonEnglishSegments.length > 0,
    nonEnglishSegments,
    judgedSegmentCount,
  };
}
