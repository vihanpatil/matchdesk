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
 * INDIAN_CV_CORPUS — Task B.2 (docs/NEXT_PHASE.md).
 *
 * H-088 found that `FIELD_VOCAB`'s 14 US-skewed entries silently rejected
 * real Indian qualifications, and B.4 found that `experience.ts`'s date
 * patterns never supported a 3-component `DD/MM/YYYY` or `DD-MM-YYYY` date
 * at all — see the B.1/B.4 write-ups in `education.ts`/`experience.ts`.
 * These fixtures pin BOTH defect classes together, the way a real Indian CV
 * actually presents them: a recognised-but-previously-unmatched engineering
 * discipline AND an Indian date format on the same document.
 *
 * **Coverage, by design:** every qualification form named in H-088's table
 * (B.E., B.Tech, M.E., M.Tech, MCA, BCA, PGDM, MBA, B.Sc) appears at least
 * once below, each with an Indian employer, an Indian city, and at least one
 * Indian-formatted date. Institution and company names are real, well-known
 * Indian companies/universities (Infosys, TCS, Anna University, IIT Madras,
 * ...) in the same spirit `education.test.ts` already committed (H-088) —
 * the CANDIDATE and their specific work history are fictional; only the
 * institution/employer names are real public entities, which is what kept
 * that file's ADR-014 scan clean.
 *
 * **Date formats are deliberately UNAMBIGUOUS where a number is asserted.**
 * Every 3-component date below has at least one day value of 13-31 on at
 * least one side of the range, which is what B.4 established is the only
 * safe, non-guessing fix (`13/04/2019` cannot be anything but 13 April).
 * The genuinely locale-ambiguous shape (`03/04/2019`, both numbers <=12) is
 * NOT exercised here — B.4 left it an open residual and reports it to the
 * lead rather than picking a locale, so no fixture may quietly assume one.
 *
 * @type {readonly Fixture[]}
 */
export const INDIAN_CV_CORPUS = [
  {
    id: 'indian-be-ece-unambiguous-dates',
    defectClass: 'H-088 (FIELD_VOCAB) / B.4 (date format)',
    severity: 'wrong-score',
    why: 'B.E. in Electronics and Communication used to extract NO education at all: the pattern matched, but "be" needed corroborating context and Electronics and Communication was outside the old 14-entry FIELD_VOCAB. Separately, employment written DD/MM/YYYY or DD-MM-YYYY used to lose the day silently and sometimes the month too. Both dates below have an unambiguous day (13, 15, 20), so B.4\'s fix applies and both roles must produce real tenure.',
    lines: [
      'Ananya Krishnan',
      '',
      'Professional Experience',
      '',
      'Software Engineer, Infosys, Bengaluru, 13/06/2019 - Present',
      'Built and operated distributed services in Java and Spring Boot.',
      '',
      'Software Engineer, Tata Consultancy Services, Chennai, 15-07-2016 - 20-05-2019',
      'Maintained PostgreSQL databases and Docker deployments.',
      '',
      'Education',
      '',
      'BE in Electronics and Communication, Anna University, 2016',
      '',
      'Skills',
      '',
      'Java, Spring Boot, PostgreSQL, Docker, AWS',
    ],
  },

  {
    id: 'indian-me-structural-dash-dates',
    defectClass: 'H-088 (FIELD_VOCAB) / B.4 (date format)',
    severity: 'wrong-score',
    why: "M.E. in Structural Engineering — the exact pairing named in H-088's own residual note — used to extract nothing for the identical reason as B.E./ECE above. Dates use the DD-MM-YYYY (dash) form, which used to drop the month entirely and default to January, silently understating tenure by up to 11 months.",
    lines: [
      'Devika Pillai',
      '',
      'Professional Experience',
      '',
      'Structural Engineer, Larsen Infra Projects, Mumbai, 18-02-2014 - 25-11-2021',
      'Designed structural systems for commercial and residential developments.',
      '',
      'Education',
      '',
      'M.E. in Structural Engineering, IIT Madras, 2019',
      '',
      'Skills',
      '',
      'AutoCAD, STAAD.Pro, Project Management',
    ],
  },

  {
    id: 'indian-btech-eee-slash-dates',
    defectClass: 'H-088 (FIELD_VOCAB) / B.4 (date format)',
    severity: 'wrong-score',
    why: 'B.Tech in EEE exercises the short-form abbreviation used constantly on Indian CVs, stated with "in" so the field itself resolves (not merely the degree level) — the direct-adjacent phrasing "B.Tech EEE" with no preposition leaves `field` null regardless of vocabulary, which is existing, precedented behaviour (see the bare "BSc Computer Science" in `baseline-clean-cv`) and not what this fixture is for. Dates use DD/MM/YYYY with an unambiguous day (17, 22).',
    lines: [
      'Karthik Iyer',
      '',
      'Professional Experience',
      '',
      'Electrical Engineer, Tech Mahindra, Pune, 17/01/2018 - 22/08/2022',
      'Commissioned electrical distribution systems for industrial clients.',
      '',
      'Education',
      '',
      'B.Tech in EEE, Vellore Institute of Technology, 2018',
      '',
      'Skills',
      '',
      'AutoCAD, MATLAB, SCADA',
    ],
  },

  {
    id: 'indian-mtech-ece-nit',
    defectClass: 'H-088 (FIELD_VOCAB)',
    severity: 'wrong-score',
    why: 'M.Tech in Electronics and Communication Engineering (ECE), the postgraduate counterpart to the B.E./B.Tech ECE cases above, from a different named institution (NIT Trichy) to avoid the corpus looking like one hand-picked example.',
    lines: [
      'Meera Krishnamurthy',
      '',
      'Professional Experience',
      '',
      'RF Engineer, HCL Technologies, Chennai, Jun 2015 - Present',
      'Designed RF front-end circuits for telecom equipment.',
      '',
      'Education',
      '',
      'M.Tech in Electronics and Communication Engineering, NIT Trichy, 2015',
      '',
      'Skills',
      '',
      'MATLAB, VHDL, Signal Processing',
    ],
  },

  {
    id: 'indian-mca-tcs',
    defectClass: 'H-088',
    severity: 'wrong-score',
    why: 'MCA (Master of Computer Applications) is a standard Indian postgraduate qualification that used to extract nothing (H-088). Distinctive enough not to need FIELD_VOCAB corroboration, so this fixture is mainly date-format coverage: a bare MM/YYYY range, which already worked before B.4.',
    lines: [
      'Rahul Deshpande',
      '',
      'Professional Experience',
      '',
      'Software Developer, Tata Consultancy Services, Pune, 03/2017 - Present',
      'Built internal tooling and reporting services used across the company.',
      '',
      'Education',
      '',
      'MCA, Savitribai Phule Pune University, 2016',
      '',
      'Skills',
      '',
      'Java, SQL, Spring Boot',
    ],
  },

  {
    id: 'indian-bca-hcl',
    defectClass: 'H-088 / B.4 (date format)',
    severity: 'wrong-score',
    why: 'BCA (Bachelor of Computer Applications), another Indian qualification that used to extract nothing (H-088), paired with an unambiguous DD/MM/YYYY range (day 28).',
    lines: [
      'Sneha Bhatt',
      '',
      'Professional Experience',
      '',
      'Systems Analyst, HCL Technologies, Noida, 28/04/2016 - Present',
      'Supported enterprise resource planning systems for manufacturing clients.',
      '',
      'Education',
      '',
      'BCA, Bangalore University, 2016',
      '',
      'Skills',
      '',
      'SQL, Python, Linux',
    ],
  },

  {
    id: 'indian-pgdm-marketing-xlri',
    defectClass: 'H-088',
    severity: 'wrong-score',
    why: "PGDM (Post Graduate Diploma in Management), India's MBA-equivalent postgraduate management qualification, used to extract nothing (H-088). Mapped to `master` on that basis — a judgement, not a fact, recorded in education.ts.",
    lines: [
      'Arjun Mehta',
      '',
      'Professional Experience',
      '',
      'Brand Manager, Zoho Corporation, Chennai, Jul 2019 - Present',
      'Led go-to-market strategy and stakeholder management for a SaaS product line.',
      '',
      'Education',
      '',
      'PGDM in Marketing, XLRI Jamshedpur, 2019',
      '',
      'Skills',
      '',
      'Product Marketing, Stakeholder Management, Analytics',
    ],
  },

  {
    id: 'indian-btech-then-mba-gurugram',
    defectClass: 'H-088 / B.4 (date format)',
    severity: 'wrong-score',
    why: 'A common Indian career path — engineering degree followed by an MBA — carrying TWO degrees on one CV: B.Tech (already recognised before H-088) and MBA (also already recognised), so this fixture is mainly a B.4 date-format check: both roles use DD/MM/YYYY with an unambiguous day (14, 19, 21).',
    lines: [
      'Priyanka Rao',
      '',
      'Professional Experience',
      '',
      'Product Manager, Tech Mahindra, Gurugram, 21/06/2021 - Present',
      'Owned the roadmap for a business-to-business logistics platform.',
      '',
      'Associate Engineer, Wipro, Hyderabad, 14/07/2016 - 19/05/2019',
      'Built backend services for telecom billing systems.',
      '',
      'Education',
      '',
      'MBA, Indian Institute of Management Ahmedabad, 2021',
      'B.Tech in Computer Science, Anna University, 2016',
      '',
      'Skills',
      '',
      'Product Strategy, SQL, Java',
    ],
  },

  {
    id: 'indian-bsc-zoho',
    defectClass: 'H-088',
    severity: 'wrong-score',
    why: 'B.Sc, the plain-science undergraduate degree common in India, already matched the DEGREE_PATTERNS before H-088 (it is a distinctive British-convention abbreviation, never bare), so this fixture is coverage for the required qualification-form list rather than a new defect — a clean Indian baseline alongside the defect-class fixtures above.',
    lines: [
      'Nikhil Varma',
      '',
      'Professional Experience',
      '',
      'QA Engineer, Zoho Corporation, Chennai, Feb 2018 - Present',
      'Built automated test suites for a customer relationship management product.',
      '',
      'Education',
      '',
      'B.Sc Computer Science, Loyola College, 2017',
      '',
      'Skills',
      '',
      'Python, Selenium, SQL',
    ],
  },

  {
    id: 'us-localised-twin-of-indian-be-ece',
    defectClass: 'H-088 (twin comparison)',
    severity: 'wrong-score',
    why: 'The H-088 claim, pinned as a fixture rather than a one-off manual measurement: the SAME candidate, SAME facts (role titles, tenure-in-months, skills, degree level and field), scores IDENTICALLY whether the CV is written in Indian convention (`indian-be-ece-unambiguous-dates` above: BE, DD/MM/YYYY and DD-MM-YYYY dates, Indian employers/cities) or US convention (B.S., "Mon YYYY" dates, US employers/cities). Only the REGIONAL PRESENTATION differs — employer name, city, degree-letter convention, date format — never the underlying facts. See the paired assertion in text-tier.test.mjs. Institution and employer are never scored (ADR-007), so the identical-score claim would hold even if this fixture used different fictional names; matching tenure-in-months and field-in-substance is what makes the pairing meaningful rather than coincidental.',
    lines: [
      'Ananya Krishnan',
      '',
      'Professional Experience',
      '',
      'Software Engineer, Alderbrook Technologies, Austin, Jun 2019 - Present',
      'Built and operated distributed services in Java and Spring Boot.',
      '',
      'Software Engineer, Meridian Consulting Group, Dallas, Jul 2016 - May 2019',
      'Maintained PostgreSQL databases and Docker deployments.',
      '',
      'Education',
      '',
      'B.S. in Electronics and Communication, State University, 2016',
      '',
      'Skills',
      '',
      'Java, Spring Boot, PostgreSQL, Docker, AWS',
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
