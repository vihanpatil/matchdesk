/**
 * The Section 9.2 fixture corpus — definitions (ADR-018 Decision 3, ADR-023 E3).
 *
 * **ADR-014 is absolute: every line below is synthetic.** No real CV, no real
 * job description, no recruiter-identifying content, ever. The names are drawn
 * from `packages/core/src/testkit/cv.ts`, which chose them to exercise
 * boundary logic rather than for variety.
 *
 * **Why this exists when 25 metamorphic relations already do.** Relations
 * compare two runs and assert how they relate — `score(cv)` must equal
 * `score(cv with the header renamed)`. That catches failures nobody imagined,
 * and it is why it is the primary net (ADR-019). But it proves only
 * SELF-CONSISTENCY: if the whole system shifts consistently in the wrong
 * direction, every relation still passes, because both sides move together.
 *
 * A golden fixture is the other half. It compares against an answer a human
 * looked at and endorsed. Neither technique subsumes the other, and E3 exists
 * because the project had only one of them.
 *
 * **One fixture per known wrong-score defect class, plus a clean baseline.**
 * Each carries the defect that motivated it, so a future reader can tell what
 * the fixture is FOR — a fixture whose purpose is forgotten gets "fixed" to
 * match new behaviour the first time it fails, which is the failure mode
 * `docs/SESSION_STATE.md` §7 warns about.
 *
 * These definitions are consumed twice: as plain text straight into
 * `packages/core` (the text tier), and rendered to real PDF/DOCX bytes through
 * the full ingestion pipeline (the binary tier). They are data only — no
 * assertions here — because the two tiers assert different things about the
 * same document.
 */

/**
 * @typedef {object} Fixture
 * @property {string} id Stable identifier. Also the snapshot key, so renaming
 *   one orphans its snapshot rather than silently rewriting it.
 * @property {string | null} defectClass The HONESTY_LOG entry or H-028 defect
 *   this pins. `null` only for the clean baseline, which pins nothing specific.
 * @property {'wrong-score' | 'coverage-gap' | 'baseline'} severity ADR-023's
 *   classification. Only `wrong-score` fixtures gate the UI.
 * @property {string} why What went wrong, and what the correct behaviour is.
 * @property {readonly string[]} lines The document, one entry per line.
 * @property {string} [pdfUnrenderable] Present ONLY when the PDF generator
 *   physically cannot produce this document, with the reason. `pdf-lib`'s
 *   `StandardFonts` are WinAnsi-encoded, so any character outside that set —
 *   `Ł` (U+0141), a zero-width space (U+200B) — throws at draw time rather
 *   than rendering wrong. Such a fixture is covered through DOCX only, and the
 *   gap is recorded in H-067 instead of being hidden by a silent skip.
 */

/** The reference date every fixture is extracted against. Fixed, never the
 *  wall clock: extraction is a function of (text, referenceDate), and a
 *  clock-derived value would make every tenure figure drift (ADR-024/H-052). */
export const CORPUS_REFERENCE_DATE = /** @type {const} */ ({ year: 2026, month: 8 });

/** @type {readonly Fixture[]} */
export const CORPUS = [
  {
    id: 'd1-unrecognised-section-header',
    defectClass: 'H-028 D1',
    severity: 'wrong-score',
    why: 'Only ~4 experience-section synonyms were recognised, so an unrecognised header let a section run on and swallow the employment history beneath it. Measured cost: adding an Education section removed 53 points from a candidate. "Employment History" must be recognised, and the roles under it must still produce tenure.',
    lines: [
      'Jordan Rivera',
      '',
      'Employment History',
      '',
      'Senior Backend Engineer, Acme Corp, Jan 2020 - Present',
      'Designed and operated distributed services in Python.',
      '',
      'Career History',
      '',
      'Backend Engineer, Globex, Mar 2016 - Dec 2019',
      'Maintained PostgreSQL clusters.',
    ],
  },

  {
    id: 'd2-longest-match-does-not-swallow',
    defectClass: 'H-028 D2',
    severity: 'wrong-score',
    why: 'Longest-first matching consumed "Ruby on Rails" and never emitted "ruby", so a Rails developer was rejected from a Ruby job for describing themselves more precisely. Both the framework and the language it is built on must be found.',
    lines: [
      'Alex Taylor',
      '',
      'Professional Experience',
      '',
      'Senior Web Engineer, Acme Corp, Jan 2019 - Present',
      'Built and maintained customer-facing web applications.',
      '',
      'Skills',
      '',
      'Ruby on Rails, PostgreSQL, Docker',
    ],
  },

  {
    id: 'd3-name-never-manufactures-a-skill',
    defectClass: 'H-028 D3',
    severity: 'wrong-score',
    why: 'The word-boundary guard treated every accented letter and punctuation mark as a boundary, so single-letter taxonomy entries fired constantly: "Rémi Dubois" produced an EXACT match for the skill "r", and the evidence shown to the recruiter was the letter R sliced out of the candidate\'s own name. The error path correlated with non-English names, which makes it a discrimination risk and not merely an accuracy one. This document names no programming language; the ONLY skill it may yield is "stakeholder management", which it states in plain words.',
    lines: [
      'Rémi Dubois',
      '',
      'Summary',
      '',
      'Led R&D for payments at a mid-sized retailer.',
      'Go-to-market strategy and stakeholder management.',
      '',
      'Employment History',
      '',
      'Programme Manager, Initech, Jan 2021 - Present',
    ],
  },

  {
    id: 'd4a-job-title-is-not-a-degree',
    defectClass: 'H-028 D4',
    severity: 'wrong-score',
    why: 'The job title "Associate Software Engineer" produced an associate DEGREE. Confirmed effect: +50 points for a candidate with no degree, and a hard eligibility gate flipped from fail to pass, with the evidence highlight pointing at a word inside a job title. A job title must never produce education.',
    lines: [
      'Zoë Ashworth',
      '',
      'Employment History',
      '',
      'Associate Software Engineer, Acme Corp, Feb 2022 - Present',
      'Wrote services in Java.',
    ],
  },

  {
    id: 'd4b-certification-level-is-not-a-degree',
    defectClass: 'H-028 D4',
    severity: 'wrong-score',
    why: 'A certification LEVEL name produced a degree: "AWS Certified Solutions Architect - Associate" yielded an associate degree. The certification itself is a real credential and should be extracted; the word naming its level must not become education.',
    lines: [
      'Ravi Subramanian',
      '',
      'Professional Experience',
      '',
      'Cloud Engineer, Acme Corp, Mar 2021 - Present',
      'Designed and operated cloud infrastructure for payment services.',
      '',
      'Certifications',
      '',
      'AWS Certified Solutions Architect - Associate',
    ],
  },

  {
    id: 'd4c-prose-is-not-a-degree',
    defectClass: 'H-028 D4 / H-033',
    severity: 'wrong-score',
    why: 'Ordinary English prose produced a degree, because the degree guard accepted any field-of-study word following "as": "...subjects such as Mathematics" yielded an associate degree. H-033 narrowed this to the lower-case word; the sentence below must still produce nothing.',
    lines: [
      'Anne-Marie O’Brien',
      '',
      'Summary',
      '',
      'Tutored school pupils in subjects such as Mathematics, Physics and Chemistry.',
    ],
  },

  {
    id: 'd5-education-dates-are-not-employment',
    defectClass: 'H-028 D5',
    severity: 'wrong-score',
    why: 'Date ranges inside an Education section were scored as employment, so a candidate 2.6 years into their career was inferred as PRINCIPAL. It also put an age proxy into the score by an indirect route: ADR-007 forbids extracting graduation year, but the RANGE containing it was becoming tenure. Only the employment range below may count.',
    lines: [
      'Bjørn Sørensen',
      '',
      'Education',
      '',
      'BSc Computer Science, 2012 - 2016',
      'MSc Distributed Systems, 2016 - 2018',
      '',
      'Employment History',
      '',
      'Software Engineer, Acme Corp, Jan 2024 - Present',
    ],
  },

  {
    id: 'd5b-explicit-claim-not-summed-with-ranges',
    defectClass: 'H-028 D5b',
    severity: 'wrong-score',
    pdfUnrenderable:
      'The name "Łukasz Nowak" contains U+0141, outside WinAnsi. The name is kept rather than swapped for an ASCII one: non-English names are exactly where H-028 D3 went wrong, and sanitising the corpus to suit the generator would remove the property the corpus exists to test.',
    why: 'An explicit "N years of experience" statement was added to the date ranges that DESCRIBE it, roughly doubling apparent tenure — 24.5 years for a ~14.6 year career. The claim and the ranges are the same fact stated twice. Total tenure must not exceed the larger of the two.',
    lines: [
      'Łukasz Nowak',
      '',
      'Summary',
      '',
      '10 years of experience building backend systems.',
      '',
      'Employment History',
      '',
      'Engineer, Acme Corp, Jan 2016 - Jan 2026',
    ],
  },

  {
    id: 'd5c-quantity-is-not-a-date-range',
    defectClass: 'H-028 D5c',
    severity: 'wrong-score',
    why: '"budget of 2000 - 2024 USD" parsed as 24 years of employment. A bare YYYY - YYYY range adjacent to a quantity word is a magnitude, not a tenure. Only the real employment range below may count.',
    lines: [
      'José García',
      '',
      'Employment History',
      '',
      'Delivery Manager, Acme Corp, Jan 2023 - Present',
      'Owned a budget of 2000 - 2024 USD per project.',
      'Managed a portfolio of 1000 - 5000 accounts.',
    ],
  },

  {
    id: 'h034-invisible-characters-fabricate-nothing',
    defectClass: 'H-034 / H-048',
    severity: 'wrong-score',
    pdfUnrenderable:
      'Zero-width space (U+200B), soft hyphen (U+00AD) and BOM (U+FEFF) are outside WinAnsi and cannot be drawn by a StandardFont. This is the most costly instance of the limitation: H-034 notes that soft hyphens are ROUTINE IN PDF EXTRACTION, so the one container where these characters actually occur in the wild is the one this generator cannot produce them in. Covered through DOCX only. See H-067.',
    why: 'Invisible characters do not merely BREAK extraction, they FABRICATE credentials: "Java\\u200bScript" extracted as the skill "java" — a different and false claim about a person. The initial fix was a hand-written list of six characters; an adversarial round found sixteen more that break it identically. The zero-width space below must not turn JavaScript into Java.',
    lines: [
      'Alex Taylor',
      '',
      'Professional Experience',
      '',
      'Senior Engineer, Acme Corp, Jan 2019 - Present',
      'Built and maintained customer-facing web applications.',
      '',
      'Skills',
      '',
      'Java​Script, Postgre­SQL, Doc﻿ker',
    ],
  },

  {
    id: 'h040-overlapping-roles-not-double-counted',
    defectClass: 'H-040',
    severity: 'wrong-score',
    why: 'Two concurrent roles are one span of calendar time, not two. Total tenure may never exceed the span from the earliest start to the latest end — here Jan 2020 to Jan 2026, six years — however many overlapping roles describe it.',
    lines: [
      'Jordan Rivera',
      '',
      'Employment History',
      '',
      'Principal Engineer, Acme Corp, Jan 2020 - Jan 2026',
      'Technical Advisor, Globex, Jan 2021 - Jan 2025',
      'Contract Engineer, Initech, Jun 2022 - Jun 2024',
    ],
  },

  {
    id: 'gap-certification-level-variants-collapse',
    defectClass: 'H-028 D8',
    severity: 'coverage-gap',
    why: 'DOCUMENTED GAP — this fixture pins behaviour that is WRONG, so the gap is visible rather than rediscovered. The gazetteer matches the base certification name and ignores the level suffix, so "…Solutions Architect - Professional" and "…- Associate" BOTH extract as `aws-saa`, the Associate id. Two distinct credentials collapse into one, silently, and the recruiter is shown the base name either way. It is recorded as coverage-gap rather than wrong-score on a specific and checkable argument: the gazetteer has no Professional id, so a job cannot express "Professional required" either, and no score can currently differ because of the collapse. That argument fails the moment a level-bearing id is added, at which point this becomes wrong-score and must be reclassified. Change the assertion only together with the classification.',
    lines: [
      'Ravi Subramanian',
      '',
      'Professional Experience',
      '',
      'Cloud Engineer, Acme Corp, Mar 2021 - Present',
      'Designed and operated cloud infrastructure for payment services.',
      '',
      'Certifications',
      '',
      'AWS Certified Solutions Architect - Professional',
    ],
  },

  {
    id: 'baseline-clean-cv',
    defectClass: null,
    severity: 'baseline',
    why: 'The control. Nothing unusual, nothing adversarial — an ordinary CV whose extraction should be entirely uncontroversial. Its job is to fail when a fix for one of the defects above breaks the common case, which is the direction of damage a corpus of edge cases alone cannot see.',
    lines: [
      'Alex Taylor',
      '',
      'Professional Experience',
      '',
      'Senior Software Engineer, Acme Corp, Jan 2020 - Present',
      'Built and operated distributed services in TypeScript and Python.',
      '',
      'Software Engineer, Globex, Jun 2017 - Dec 2019',
      'Maintained PostgreSQL databases and Docker deployments.',
      '',
      'Education',
      '',
      'BSc Computer Science',
      '',
      'Skills',
      '',
      'TypeScript, Python, PostgreSQL, Docker, AWS',
    ],
  },
];

/**
 * @typedef {object} RefusalFixture
 * @property {string} id
 * @property {string} why
 * @property {'pdf' | 'docx'} format Which container this must be rendered as.
 *   Refusals are format-specific: scan detection is a per-PAGE character
 *   density rule and a DOCX has no pages.
 * @property {readonly string[]} lines
 * @property {'needs_attention' | 'failed'} parseStatus
 * @property {string} reason The `ExtractionReason` the pipeline must give.
 */

/**
 * Documents the pipeline must REFUSE, never score (C7).
 *
 * These exercise the half of the system the text tier cannot reach at all.
 * Feeding a string to `extractAttributes` bypasses scan detection, the
 * Cavnar & Trenkle language classifier and the ADR-022 mixed-language veto —
 * every one of which lives in `apps/server/src/ingestion` and only sees real
 * bytes in a real container. H-028 D6, where a French CV classified as MORE
 * English than an English one, lived entirely here.
 *
 * A refusal is a SUCCESS. The recruiter sees the refusal and the document
 * together, so the failure is visible and recoverable — which is why ADR-023
 * classifies false-refusal as non-blocking while a silent wrong number blocks.
 *
 * @type {readonly RefusalFixture[]}
 */
export const REFUSAL_CORPUS = [
  {
    id: 'refuse-probable-scan',
    format: 'pdf',
    why: 'A scanned CV is an image; there is no v1 OCR, so there is no text to score. Below the per-page character floor the document must go to Needs attention rather than be scored on whatever fragment was readable. Scoring a candidate on a caption would be the exact C7 failure the constraint exists to prevent.',
    lines: ['Alex Taylor'],
    parseStatus: 'needs_attention',
    reason: 'low_text_density_possible_scan',
  },
  {
    id: 'refuse-non-english',
    format: 'pdf',
    why: 'H-028 D6: the original stopword detector ranked a plain French CV as MORE English than a real English one, because "on", "a", "in" and "for" are stopwords in several languages. The whole engine — taxonomy, date parsing, section headers — is English-only, so a French CV can only produce a confident meaningless number.',
    lines: [
      'Rémi Dubois',
      '',
      'Expérience professionnelle',
      '',
      'Ingénieur logiciel senior, Acme Corp, janvier 2020 à aujourd’hui',
      'Conception et exploitation de services distribués pour les paiements.',
      'Responsable de la migration des bases de données vers une architecture répartie.',
      '',
      'Formation',
      '',
      'Licence en informatique, Université de Lyon',
      '',
      'Compétences',
      '',
      'Développement logiciel, gestion de projet, travail en équipe',
    ],
    parseStatus: 'needs_attention',
    reason: 'non_english_language_not_supported',
  },
  {
    id: 'refuse-mixed-language',
    format: 'pdf',
    why: 'ADR-022, from a measured failure: a 50%-French document classified as English overall and was scored on its English half. This fixture carries French passages long enough for the detector to judge them, and the document is refused. NOTE the reason: with this much French the WHOLE-DOCUMENT classifier catches it, so the refusal is non_english_language_not_supported rather than the ADR-022 segment veto. The segment veto covers the narrower case where a document still reads as English overall — and reaching it requires non-English passages of 15+ words, which most CV lines are not. See refuse-mixed-language-SHORT-passages below and H-068.',
    lines: [
      'Rémi Dubois',
      '',
      'Professional Experience',
      '',
      'Senior Software Engineer, Acme Corp, Jan 2020 - Present',
      'Built and operated distributed services in TypeScript and Python, working closely with the platform team to deliver a reliable payments experience for customers.',
      'Maintained PostgreSQL databases and Docker deployments across three regions and improved the reliability of the deployment pipeline considerably over two years.',
      '',
      'Expérience professionnelle',
      '',
      'Ingénieur logiciel senior chez Globex, de janvier 2016 à décembre 2019, responsable de la conception et de exploitation des services distribués pour les paiements internationaux.',
      'Encadrement quotidien une équipe de six personnes, gestion des recrutements techniques et animation des réunions hebdomadaires avec les équipes commerciales de entreprise.',
    ],
    parseStatus: 'needs_attention',
    reason: 'non_english_language_not_supported',
  },
];
