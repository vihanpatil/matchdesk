import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { detectLanguageHeuristic, findNonEnglishSegments } from './languageDetection.js';

/**
 * Real evaluation set for the language detector (H-028 D6 / ADR-018).
 *
 * H-023 and H-028 D6 both found the previous stopword-ratio heuristic
 * "calibrated" against exactly two fixtures. This file is the replacement:
 * a corpus of realistic, entirely SYNTHETIC CVs (ADR-014: the repo is
 * public, so no real person's document is ever used) spanning the shapes a
 * recruiter actually uploads, with the resulting confusion matrix asserted
 * directly rather than described in prose.
 *
 * All text here is original and independent of the reference corpora baked
 * into `languageDetection.ts` — this file is the held-out side of the
 * evaluation, not a copy of the training data.
 */

// ---- English: at least 8 CVs, spanning realistic document shapes --------

const ENGLISH_CVS: Record<string, string> = {
  full_prose_1: `Taylor Whitfield is a backend engineer with seven years of experience designing distributed systems for e-commerce platforms. Taylor has worked extensively with Python, Go and PostgreSQL, and has led the migration of a monolithic checkout service to an event-driven architecture that now handles several million transactions per day. In addition to hands-on engineering, Taylor has mentored a team of five junior developers and regularly presents at internal engineering all-hands meetings. Taylor holds a Bachelor of Science in Computer Science and is a certified AWS Solutions Architect. Outside of core development work, Taylor has contributed to the company's incident response process, writing runbooks and leading postmortems after production outages.`,

  full_prose_2: `Morgan Ellery has spent the last decade building data pipelines and analytics platforms for logistics companies. Morgan started as a junior data engineer, learning SQL and Python on the job, and now leads a small platform team responsible for ingesting, cleaning and serving data used across the business. Morgan is comfortable working across the stack, from writing Spark jobs to building dashboards that non-technical stakeholders rely on daily. Morgan has a strong track record of shipping reliable software under tight deadlines, and enjoys pairing with less experienced engineers to help them grow. Morgan completed a master's degree in information systems before moving into industry full time.`,

  skills_list_1: `Priya Chandrasekaran
Skills: Python, Docker, Kubernetes, AWS, React, Node.js, PostgreSQL, Git, CI/CD, Agile
Experience: Senior Software Engineer at Northbridge Systems, 2019 to present. Built and maintained microservices for payment processing. Led a small team of four engineers on a rewrite of the billing system.
Education: Bachelor of Science in Computer Science, 2015.
Certifications: AWS Certified Solutions Architect - Associate`,

  skills_list_2: `Devon Okafor
Skills: Java, Spring, Hibernate, MySQL, Kafka, Jenkins, Terraform, Linux
Tools: IntelliJ, Postman, Grafana, Prometheus
Experience: Backend Engineer, Vantage Retail, 2018-present
Education: BS Computer Engineering, 2014`,

  terse_bullets_1: `Casey Nakamura - Site Reliability Engineer
- Reduced average incident response time from 45 minutes to 12 minutes
- Automated deployment pipeline, cutting release time by 60 percent
- On call rotation lead for a team of eight engineers
- Migrated legacy infrastructure to containers, improving uptime
- Wrote internal tooling used by over 200 engineers company wide
- Mentored three new hires during their first six months`,

  terse_bullets_2: `Riley Bergstrom - Product Manager, Growth
- Launched three features that increased signups by 18 percent
- Ran weekly experiments across the onboarding funnel
- Partnered with design and engineering on a full redesign
- Presented quarterly results to senior leadership
- Owned the roadmap for a team of six engineers
- Reduced churn by improving the first week experience`,

  code_heavy: `Sam Iverson - Software Engineer
function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }
const config = { retries: 3, timeout: 5000, baseUrl: 'https://api.example.com' };
class OrderService { async placeOrder(cart) { const total = calculateTotal(cart.items); return this.repository.save({ cart, total }); } }
Experience: Full Stack Engineer, 2017-present. Built the checkout service above and its surrounding test suite. Comfortable with JavaScript, TypeScript, Python and SQL.`,

  headers_plus_tech_only: `Jamie Okonkwo
Contact: jamie.okonkwo@example.com, Springfield
Skills: AWS, GCP, Terraform, Ansible, Docker, Kubernetes, Python, Bash
Experience: DevOps Engineer, 2016-present
Certifications: CKA, AWS SysOps Administrator
Education: BS, Information Technology`,
};

// ---- Non-English: at least 8 CVs, one per required language -------------

const NON_ENGLISH_CVS: Record<string, string> = {
  french: `Alex Fontaine est développeuse chez Solmédia depuis quatre ans. Elle a construit des services back-end en Python et Go, et a participé à la migration vers une architecture de microservices. Alex encadre deux stagiaires et collabore avec l'équipe produit chaque semaine. Elle est titulaire d'un master en informatique obtenu à Lyon.`,

  german: `Nadine Brandt arbeitet seit fünf Jahren als Softwareentwicklerin bei Kernwerk GmbH. Sie hat Backend-Dienste in Java und Kotlin entwickelt und den Übergang zu einer Microservice-Architektur begleitet. Nadine betreut zwei Praktikanten und arbeitet eng mit dem Produktteam zusammen. Sie hat einen Masterabschluss in Informatik von der Technischen Universität München.`,

  spanish: `Carlos Iturbe trabaja como desarrollador de software en Tecnova desde hace seis años. Ha construido servicios backend en Python y Java, y participó en la migración hacia una arquitectura de microservicios. Carlos supervisa a dos becarios y colabora de cerca con el equipo de producto. Tiene una maestría en ciencias de la computación.`,

  italian: `Giulia Ferraro lavora come sviluppatrice software presso Vertico da cinque anni. Ha costruito servizi backend in Python e Java e ha partecipato alla migrazione verso un'architettura a microservizi. Giulia segue due tirocinanti e collabora strettamente con il team di prodotto. Ha conseguito una laurea magistrale in informatica.`,

  dutch: `Sanne de Vries werkt sinds vier jaar als softwareontwikkelaar bij Bloemveld. Ze heeft backend-diensten gebouwd in Python en Java en heeft meegewerkt aan de overstap naar een microservicearchitectuur. Sanne begeleidt twee stagiairs en werkt nauw samen met het productteam. Ze heeft een masterdiploma in informatica behaald.`,

  danish: `Mette Holm har arbejdet som softwareudvikler hos Nordbyg i fire år. Hun har bygget backend-tjenester i Python og Java og har deltaget i overgangen til en mikroservicearkitektur. Mette vejleder to praktikanter og samarbejder tæt med produktteamet. Hun har en kandidatgrad i datalogi.`,

  norwegian: `Kristoffer Aas har jobbet som programvareutvikler hos Fjellkode i fire år. Han har bygget backend-tjenester i Python og Java og har deltatt i overgangen til en mikrotjenestearkitektur. Kristoffer veileder to praktikanter og samarbeider tett med produktteamet. Han har en mastergrad i informatikk.`,

  swedish: `Elin Sjöberg har arbetat som mjukvaruutvecklare på Norrkod i fyra år. Hon har byggt backend-tjänster i Python och Java och har deltagit i övergången till en mikrotjänstarkitektur. Elin handleder två praktikanter och samarbetar nära med produktteamet. Hon har en masterexamen i datavetenskap.`,

  // Regression case: the pre-existing `candidate-french.docx` fixture used by
  // extractText.test.ts, with accents stripped entirely (this is exactly the
  // text inside that fixture). Kept as its own entry because accent loss is
  // realistic (bad encoding, some PDF extraction paths) and is a harder case
  // than accented French for a profile trained on accented text.
  french_unaccented: `Jordan Rivera est ingenieur logiciel avec cinq ans d'experience dans la creation de systemes back-end en Python et Go. Jordan a dirige des migrations vers des microservices et encadre des ingenieurs juniors dans une equipe de dix personnes.`,
};

interface ConfusionRow {
  readonly label: string;
  readonly expectedEnglish: boolean;
  readonly actual: boolean | null;
}

function classify(corpus: Record<string, string>, expectedEnglish: boolean): ConfusionRow[] {
  return Object.entries(corpus).map(([label, text]) => ({
    label,
    expectedEnglish,
    actual: detectLanguageHeuristic(text).isEnglish,
  }));
}

describe('detectLanguageHeuristic — evaluation corpus and confusion matrix', () => {
  const rows = [...classify(ENGLISH_CVS, true), ...classify(NON_ENGLISH_CVS, false)];

  it('has at least 8 English and 8 non-English documents in the eval set', () => {
    expect(Object.keys(ENGLISH_CVS).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(NON_ENGLISH_CVS).length).toBeGreaterThanOrEqual(8);
  });

  it('classifies every English CV shape (full prose, skills-list, terse bullets, code-heavy, headers-plus-tech-only) as English', () => {
    const misclassified = rows.filter((r) => r.expectedEnglish && r.actual !== true);
    // Printed on failure so a real regression shows exactly which shape broke,
    // rather than just "expected true, got false" with no document identity.
    expect(misclassified.map((r) => r.label)).toEqual([]);
  });

  it('classifies every non-English CV (French, German, Spanish, Italian, Dutch, Danish, Norwegian, Swedish, plus an accent-stripped French regression) as not English', () => {
    const misclassified = rows.filter((r) => !r.expectedEnglish && r.actual !== false);
    expect(misclassified.map((r) => r.label)).toEqual([]);
  });

  it('reports the full confusion matrix (true positive / false negative / true negative / false positive)', () => {
    const truePositive = rows.filter((r) => r.expectedEnglish && r.actual === true).length;
    const falseNegative = rows.filter((r) => r.expectedEnglish && r.actual !== true).length;
    const trueNegative = rows.filter((r) => !r.expectedEnglish && r.actual === false).length;
    const falsePositive = rows.filter((r) => !r.expectedEnglish && r.actual !== false).length;

    // This is the property that actually matters for ADR-006/C7: zero
    // non-English documents may ever be classified as English (a false
    // positive here is a confidently-scored, unreadable document — the
    // exact C7 failure). English recall matters for usability but a false
    // negative there only causes an unnecessary refusal, not a wrong score.
    expect(falsePositive).toBe(0);
    expect(truePositive + falseNegative).toBe(Object.keys(ENGLISH_CVS).length);
    expect(trueNegative + falsePositive).toBe(Object.keys(NON_ENGLISH_CVS).length);
  });
});

describe('detectLanguageHeuristic — documented limitations (not requirements; tracked honestly)', () => {
  it('KNOWN LIMITATION: an English document that is purely a comma-separated technology list with no structural English text at all can be misjudged as not English', () => {
    // Deliberately more extreme than `headers_plus_tech_only` above (which
    // DOES pass): no header words, no section labels, no verbs, nothing but
    // technology names that appear verbatim in every language's CV. No
    // character-statistics approach can reliably win this comparison,
    // because there is no English-specific signal left to measure — see the
    // "Honest limitations" section of languageDetection.ts. Documented here,
    // as current actual behaviour, rather than silently left unmentioned.
    const text =
      'Skills: Python, Docker, AWS, Kubernetes, React, SQL, Git, Linux, Terraform, Jenkins, GraphQL, Redis';
    const result = detectLanguageHeuristic(text);
    expect(result.isEnglish).toBe(false);
  });

  it('judges a code-switched (bilingual) document as one blob — which is why the segment veto exists (ADR-022)', () => {
    const text =
      'Jordan Rivera is a software engineer with five years of experience. Jordan a dirige des migrations vers des microservices et encadre des ingenieurs juniors dans une equipe.';
    // Whichever language's statistics dominate wins the aggregate. This is
    // no longer merely "documented": `findNonEnglishSegments` vetoes exactly
    // this case downstream, and `extractText` refuses the document. The
    // assertion stays so the two layers cannot silently drift apart — if
    // this ever flips to false, the veto is doing work it no longer needs to.
    expect(detectLanguageHeuristic(text).isEnglish).toBe(true);
    expect(findNonEnglishSegments(text).hasNonEnglishSegment).toBe(true);
  });

  it('does NOT misjudge a short, minimally-structured English bullet CV that has at least a couple of header/verb words', () => {
    // Contrast with the pure-comma-list case above: a little structure
    // (headers, short verb phrases) is enough, which is the realistic case
    // most terse CVs actually fall into.
    const text = `Skills: Python, Docker, AWS
- Built APIs
- Led team
- Shipped features
- Fixed bugs
- Wrote tests
- Reviewed code`;
    const result = detectLanguageHeuristic(text);
    expect(result.isEnglish).toBe(true);
  });
});

// -------------------------------------------------------------------------
// HELD-OUT corpus for the mixed-language veto (ADR-022).
//
// The 15-word segment floor was first chosen by testing against ENGLISH_CVS
// above — the same documents this file asserts on. That is the trap H-023
// and H-028 D6 were both about: a threshold fitted to the fixtures that
// grade it looks calibrated and is not.
//
// This corpus is the independent check. Different names, and deliberately
// outside the software-engineering domain that BOTH the reference profiles
// in languageDetection.ts AND the ENGLISH_CVS above are drawn from: nursing,
// teaching, accountancy, catering, trades, logistics, science, law, admin,
// haulage. If the detector or the floor only works on software CVs, this is
// what exposes it.
// -------------------------------------------------------------------------

const HELD_OUT_ENGLISH_CVS: Record<string, string> = {
  nurse_prose: `Bernadette Achebe is a registered nurse with eleven years of experience in acute cardiac care. She has worked night rotations on a thirty-bed ward, coordinating with consultants and allied health staff to manage post-operative recovery. Bernadette trains new graduate nurses each intake and sits on the ward's medication safety committee. She holds a Bachelor of Nursing and maintains current advanced life support certification.`,

  teacher_prose: `Hollis Marchetti has taught secondary mathematics for nine years across two comprehensive schools. He currently leads the numeracy intervention programme, working with pupils who arrive below the expected standard, and has raised attainment in his cohort for four consecutive years. Hollis mentors trainee teachers on placement and contributes to the department's scheme of work. He holds a postgraduate certificate in education.`,

  accountant_prose: `Winifred Osei-Bonsu is a chartered accountant specialising in statutory audit for mid-market manufacturing clients. Over eight years she has managed audit engagements from planning through to completion, supervising teams of three to five and presenting findings to audit committees. Winifred has led the transition of two clients onto new revenue recognition standards.`,

  scientist_prose: `Oluwaseun Adeyinka-Brooks is a research scientist working on freshwater ecology. Her doctoral work examined nutrient loading in lowland rivers, and she has since published on catchment restoration in three peer-reviewed journals. Oluwaseun designs and runs field sampling campaigns, supervises two doctoral students, and manages a modest grant portfolio.`,

  admin_short_prose: `Marisol Cabrera-Lynch has managed a busy medical practice reception for seven years. She oversees appointment scheduling, patient records and the daily reconciliation of payments, and has introduced a recall system that improved screening uptake.`,

  chef_terse: `Dmitri Karalis - Head Chef
- Ran a brigade of fourteen across two services daily
- Cut food waste by a third through revised prep scheduling
- Designed seasonal menus changing four times a year
- Managed supplier relationships and weekly ordering
- Trained six commis chefs to chef de partie level`,

  electrician_terse: `Sione Fifita - Qualified Electrician
- Completed domestic and light commercial installations
- Carried out periodic inspection and testing to current wiring regulations
- Supervised two apprentices on site
- Maintained fault-free record across four years of scheduled maintenance
- Held responsibility for site safety documentation`,

  logistics_headers: `Anneliese Vogt-Ramirez
Contact: a.vogt.ramirez@example.com
Skills: Warehouse Management, SAP, Forecasting, Route Planning, Inventory Control
Experience: Logistics Coordinator, 2017-present
Certifications: Forklift, IOSH Managing Safely
Education: Diploma in Supply Chain Management`,

  paralegal_mixed_shape: `Thaddeus Ngcobo
Paralegal with six years in commercial property. Prepares lease documentation, manages completions, and liaises with land registry.
Skills: Drafting, Title Review, Case Management Systems
Education: LLB, 2016
Additional: Conversational Portuguese`,

  driver_very_terse: `Kwabena Boateng - HGV Driver
Class 1 licence, clean record, twelve years
Long distance and multi-drop experience
Digital tachograph and drivers hours compliant
Manual handling trained`,
};

/**
 * Indian-English CVs — a PRIMARY case for this product, not an edge.
 *
 * The recruiter this tool is built for works with Indian clients, so degrees
 * from Indian universities are routine input. ADR-030's compounding signal
 * falsely refused 2 of these 5 on its first run (H-086): long transliterated
 * proper nouns like "Visvesvaraya Technological University" measure 9.43
 * letters per word and read as Swedish; an education section of Indian
 * university names measures 9.54 and reads as Italian.
 *
 * All synthetic (ADR-014). Kept as a permanent corpus so this cannot regress:
 * neither of the other two English corpora contained a single Indian CV, which
 * is exactly why the defect shipped.
 */
const INDIAN_ENGLISH_CVS: Record<string, string> = {
  iit_prose: `Ananya Venkataraman is a backend engineer with six years of experience building payment systems.
She has worked extensively with Java, Spring Boot and PostgreSQL at a large fintech company in Bengaluru.
Ananya led the migration of the settlement service to an event driven architecture handling high volumes.
Education: Bachelor of Technology in Computer Science, Indian Institute of Technology Kharagpur, 2018`,

  vtu_headers: `Rajesh Thiruvananthapuram
Contact: r.thiru@example.com
Skills: Java, Spring, Hibernate, Microservices, Kafka, Docker, Kubernetes
Experience: Senior Software Engineer, 2018-present
Education: Bachelor of Engineering, Visvesvaraya Technological University, Belagavi
Certifications: Oracle Certified Professional, AWS Solutions Architect`,

  jntu_terse: `Lakshmi Narasimhan - Data Engineer
- Built ingestion pipelines processing twelve million records daily
- Reduced query latency by forty percent through partitioning
- Mentored four junior engineers across two delivery teams
Education: Master of Technology, Jawaharlal Nehru Technological University Hyderabad
Previously: Savitribai Phule Pune University, Bachelor of Computer Applications`,

  mixed_unis: `Priyanka Balasubramanian
Education: B.Tech, Amrita Vishwa Vidyapeetham, Coimbatore, 2016
Postgraduate: M.Tech, Vellore Institute of Technology, 2019
Also attended: Birla Institute of Technology and Science Pilani, summer programme
Experience: Platform Engineer building distributed services in Go and Python`,

  uni_lines_only: `Education
Indian Institute of Technology Kharagpur
Visvesvaraya Technological University Belagavi
Jawaharlal Nehru Technological University Hyderabad
Amrita Vishwa Vidyapeetham Coimbatore`,
};

const HELD_OUT_NON_ENGLISH_CVS: Record<string, string> = {
  german_nurse: `Bernadette Achebe ist eine erfahrene Krankenschwester mit elf Jahren Erfahrung in der Herzintensivpflege. Sie hat Nachtschichten auf einer Station mit dreißig Betten übernommen und mit Fachärzten zusammengearbeitet.`,
  spanish_teacher: `Hollis Marchetti ha enseñado matemáticas en secundaria durante nueve años en dos institutos. Actualmente dirige el programa de refuerzo y trabaja con alumnos que llegan por debajo del nivel esperado.`,
  dutch_accountant: `Winifred Osei-Bonsu is een registeraccountant gespecialiseerd in wettelijke controles voor middelgrote productiebedrijven. Zij heeft controleopdrachten geleid van planning tot afronding.`,
  swedish_chef: `Dmitri Karalis har arbetat som köksmästare i tolv år och lett ett team på fjorton personer under två serveringar varje dag. Han har minskat matsvinnet med en tredjedel.`,
};

/** A French passage long enough to be a real paragraph in a CV — the
 *  realistic code-switching case is a cover paragraph or a prior-role
 *  description left in the candidate's first language. */
const FRENCH_PARAGRAPH = `Elle a travaillé pendant six ans dans un service de cardiologie où elle encadrait les infirmières nouvellement diplômées. Son expérience comprend la gestion des soins postopératoires et la coordination avec les médecins consultants du service.`;

/** One paragraph per covered language, each long enough to clear the segment
 *  floor, for the metamorphic relation below. */
const NON_ENGLISH_PARAGRAPHS: Record<string, string> = {
  fr: FRENCH_PARAGRAPH,
  de: `Sie arbeitete sechs Jahre lang in einer kardiologischen Abteilung und betreute dort neu ausgebildete Pflegekräfte. Ihre Erfahrung umfasst die postoperative Versorgung und die Zusammenarbeit mit den behandelnden Ärzten der Station.`,
  es: `Trabajó durante seis años en un servicio de cardiología donde supervisaba a las enfermeras recién tituladas. Su experiencia incluye la gestión de los cuidados postoperatorios y la coordinación con los médicos consultores del servicio.`,
  it: `Ha lavorato per sei anni in un reparto di cardiologia dove seguiva le infermiere appena diplomate. La sua esperienza comprende la gestione delle cure postoperatorie e il coordinamento con i medici consulenti del reparto.`,
  nl: `Zij werkte zes jaar op een afdeling cardiologie waar zij pas afgestudeerde verpleegkundigen begeleidde. Haar ervaring omvat het beheer van de postoperatieve zorg en de samenwerking met de behandelend artsen van de afdeling.`,
  da: `Hun arbejdede i seks år på en kardiologisk afdeling, hvor hun vejledte nyuddannede sygeplejersker. Hendes erfaring omfatter håndtering af postoperativ pleje og samarbejde med afdelingens behandlende læger.`,
  no: `Hun arbeidet i seks år ved en kardiologisk avdeling der hun veiledet nyutdannede sykepleiere. Hennes erfaring omfatter håndtering av postoperativ pleie og samarbeid med avdelingens behandlende leger.`,
  sv: `Hon arbetade i sex år på en kardiologisk avdelning där hon handledde nyutexaminerade sjuksköterskor. Hennes erfarenhet omfattar hantering av postoperativ vård och samarbete med avdelningens behandlande läkare.`,
};

describe('held-out corpus — the detector outside the domain it was built on', () => {
  it('classifies all ten held-out English CVs as English, across ten unrelated professions', () => {
    const misclassified = Object.entries(HELD_OUT_ENGLISH_CVS)
      .filter(([, cv]) => detectLanguageHeuristic(cv).isEnglish !== true)
      .map(([label]) => label);
    expect(misclassified).toEqual([]);
  });

  it('still refuses non-English CVs in those same unrelated professions', () => {
    const misclassified = Object.entries(HELD_OUT_NON_ENGLISH_CVS)
      .filter(([, cv]) => detectLanguageHeuristic(cv).isEnglish !== false)
      .map(([label]) => label);
    expect(misclassified).toEqual([]);
  });
});

describe('mixed-language veto — held-out validation of the 15-word floor (ADR-022)', () => {
  it('raises no false alarm on any of the ten held-out English CVs', () => {
    // A false alarm here is a real recruiter's real English CV being refused.
    // This is the assertion that makes the floor a measurement rather than a
    // guess, because none of these documents informed the original choice.
    const falseAlarms = Object.entries(HELD_OUT_ENGLISH_CVS)
      .filter(([, cv]) => findNonEnglishSegments(cv).hasNonEnglishSegment)
      .map(([label]) => label);
    expect(falseAlarms).toEqual([]);
  });

  it('catches a French paragraph appended to every one of the ten held-out English CVs', () => {
    const missed = Object.entries(HELD_OUT_ENGLISH_CVS)
      .filter(
        ([, cv]) => !findNonEnglishSegments(`${cv}\n${FRENCH_PARAGRAPH}`).hasNonEnglishSegment,
      )
      .map(([label]) => label);
    expect(missed).toEqual([]);
  });

  it('catches mixing the whole-document verdict misses entirely', () => {
    // The gap this closes: at these ratios the aggregate still says English,
    // so without the veto the document is scored on the part we could read
    // and silently ignores the rest.
    const englishPart = HELD_OUT_ENGLISH_CVS['nurse_prose'] ?? '';
    const oneFrenchParagraph = `${englishPart}\n${FRENCH_PARAGRAPH}`;

    expect(detectLanguageHeuristic(oneFrenchParagraph).isEnglish).toBe(true);
    expect(findNonEnglishSegments(oneFrenchParagraph).hasNonEnglishSegment).toBe(true);
  });

  it('R-L1 · inserting a non-English paragraph ANYWHERE in an English CV leaves it unscoreable', () => {
    // WAS A NESTED LOOP (H-051). It iterated 10 CVs x 8 languages at one fixed
    // insertion point — the end — which is the easiest position for a
    // segment-based veto to catch. The defect this relation exists for
    // (H-043) was precisely a POSITION/LENGTH effect: two-sentence
    // Scandinavian paragraphs fell below the word floor and were discarded.
    // A relation that cannot vary where the foreign text lands cannot test
    // that class of defect, so insertion point is now generated.
    //
    // "Unscoreable" is the disjunction extractText acts on: either the
    // whole-document verdict is already not-English, or the segment veto
    // fires. Only both failing lets a partly-unreadable document be scored.
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(HELD_OUT_ENGLISH_CVS)),
        fc.constantFrom(...Object.keys(NON_ENGLISH_PARAGRAPHS)),
        fc.nat({ max: 20 }),
        (cvLabel, langLabel, insertAt) => {
          const cv = HELD_OUT_ENGLISH_CVS[cvLabel] ?? '';
          const paragraph = NON_ENGLISH_PARAGRAPHS[langLabel] ?? '';

          // Insert at a generated LINE boundary rather than a character
          // offset, so the foreign text stays a coherent paragraph instead of
          // being spliced mid-sentence into an English one.
          const lines = cv.split('\n');
          const position = insertAt % (lines.length + 1);
          const mixed = [...lines.slice(0, position), paragraph, ...lines.slice(position)].join(
            '\n',
          );

          const refusedOutright = detectLanguageHeuristic(mixed).isEnglish === false;
          const vetoed = findNonEnglishSegments(mixed).hasNonEnglishSegment;

          expect(
            refusedOutright || vetoed,
            `${cvLabel} + ${langLabel} inserted at line ${String(position)} was left scoreable`,
          ).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('R-L2 · the veto is monotone: an English CV with nothing foreign in it stays scoreable', () => {
    // The converse, so R-L1 cannot be satisfied by a detector that simply
    // refuses everything. Generated over the corpus rather than looped, for
    // the same reason.
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(HELD_OUT_ENGLISH_CVS)), (cvLabel) => {
        const cv = HELD_OUT_ENGLISH_CVS[cvLabel] ?? '';
        const scoreable =
          detectLanguageHeuristic(cv).isEnglish === true &&
          !findNonEnglishSegments(cv).hasNonEnglishSegment;

        expect(scoreable, `${cvLabel} must remain scoreable`).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('R-L3 · adding MORE non-English text can never make a document scoreable again', () => {
    // Monotonicity in the direction that matters for C7: if one foreign
    // paragraph makes a document unscoreable, two cannot undo it. This is the
    // shape of defect where a detector "recovers" because the added text
    // shifts an aggregate back over a threshold.
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(HELD_OUT_ENGLISH_CVS)),
        fc.constantFrom(...Object.keys(NON_ENGLISH_PARAGRAPHS)),
        fc.integer({ min: 1, max: 4 }),
        (cvLabel, langLabel, copies) => {
          const cv = HELD_OUT_ENGLISH_CVS[cvLabel] ?? '';
          const paragraph = NON_ENGLISH_PARAGRAPHS[langLabel] ?? '';
          const mixed = [cv, ...Array.from({ length: copies }, () => paragraph)].join('\n');

          const refusedOutright = detectLanguageHeuristic(mixed).isEnglish === false;
          const vetoed = findNonEnglishSegments(mixed).hasNonEnglishSegment;

          expect(refusedOutright || vetoed).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('BLIND SPOT CLOSED: every held-out CV now has judgeable evidence', () => {
    // Progression, each step forced by a failing assertion rather than noticed:
    //   4 of 10 silent  (the original H-041 blind spot)
    //   1 of 10 silent  (ADR-029's prose-gated line window)
    //   0 of 10 silent  (ADR-030's letter floor — `logistics_headers` closed)
    //
    // The last step came from finding the ROOT cause: the 15-WORD floor is
    // biased against compounding languages, which pack ~1.7x more letters per
    // word, so they never reached it. Sizing the window in letters asks for
    // the same amount of TEXT regardless of how a language packages it.
    const silent = Object.entries(HELD_OUT_ENGLISH_CVS)
      .filter(([, cv]) => findNonEnglishSegments(cv).judgedSegmentCount === 0)
      .map(([label]) => label);
    expect(silent).toEqual([]);
  });

  it('a GERMAN header block inside an English header CV is caught (H-079)', () => {
    // The defect ADR-029 left open. German capitalises every noun, so German
    // header lines defeated the lowercase prose gate; and worse, the n-gram
    // profiles CLASSIFY such a block as English (dEn 69621 vs dOther 70385,
    // nearest = Italian) because a compound-noun list is out-of-domain for
    // profiles built from prose. No gate can fix a wrong verdict, so this is
    // caught by mean word length instead — morphology English does not have.
    const english = [
      'Skills: Warehouse Management, SAP, Forecasting, Route Planning, Inventory Control',
      'Systems: Oracle WMS, Manhattan Associates, Excel, Power BI, Tableau',
      'Certifications: Forklift, IOSH Managing Safely, First Aid, HACCP Level 3',
      'Sectors: Retail Distribution, Cold Chain, Third Party Logistics, E-commerce',
    ];
    const german = [
      'Kenntnisse: Lagerverwaltung, Bedarfsplanung, Tourenplanung, Bestandskontrolle',
      'Ausbildung: Diplom Logistikmanagement, Universitaet Koeln',
    ];

    // Swept across English mass, so this cannot pass merely because the
    // whole-document classifier happened to flip at one proportion.
    for (const repeats of [1, 4, 12]) {
      const lines = ['Anneliese Vogt', 'Contact: a.v@example.com'];
      for (let i = 0; i < repeats; i++) lines.push(...english);
      lines.push(...german);
      const document = lines.join('\n');

      // No blank lines: this is the PDF shape (H-062/H-065).
      expect(
        findNonEnglishSegments(document).hasNonEnglishSegment,
        `German block missed at ${String(repeats)} English blocks`,
      ).toBe(true);
      // And the whole-document classifier does NOT catch it, so the veto is
      // doing the work rather than riding on a dilution effect.
      expect(detectLanguageHeuristic(document).isEnglish).toBe(true);
    }
  });

  it('and closing it costs ZERO false refusals across BOTH English corpora', () => {
    // The number that decided the design. Blank-line-delimited runs were the
    // cheaper implementation but failed on the PDF path; the line window works
    // on PDF and cost one false refusal until the prose gate was added.
    // This is that gate's regression test — if it ever fires, the gate moved
    // or the corpus grew a shape it does not handle.
    // Checked against BOTH corpora on purpose. H-080 exists because a cost was
    // quoted from the held-out set alone, missing that the rule under
    // consideration would have refused `headers_plus_tech_only` — which this
    // eval file REQUIRES to pass.
    const falselyRefused = Object.entries({ ...ENGLISH_CVS, ...HELD_OUT_ENGLISH_CVS })
      .filter(([, cv]) => findNonEnglishSegments(cv).hasNonEnglishSegment)
      .map(([label]) => label);
    expect(falselyRefused).toEqual([]);
  });
});

describe('Indian-English CVs — a primary case, not an edge (H-086)', () => {
  it('none of them is falsely refused', () => {
    // ADR-030's compounding signal refused 2 of these 5 on its first run.
    // Neither of the other English corpora contained an Indian CV, which is
    // precisely why the defect shipped — H-022's shape for the third time.
    const refused = Object.entries(INDIAN_ENGLISH_CVS)
      .filter(([, cv]) => findNonEnglishSegments(cv).hasNonEnglishSegment)
      .map(([label]) => label);
    expect(refused).toEqual([]);
  });

  it('the institution exemption is what protects them, and it is load-bearing', () => {
    // Asserts the MECHANISM, not just the outcome. Without this, someone could
    // delete ENGLISH_INSTITUTION_WORDS, watch these CVs still pass for an
    // unrelated reason, and reintroduce the defect later.
    //
    // An education block of Indian university names measures 10.0 letters per
    // word — above the 9.4 compounding threshold, and higher than the Swedish
    // header block (10.45) is above English. Only the institution exemption
    // separates them.
    const indianUniversities =
      'Visvesvaraya Technological University Belagavi Jawaharlal Nehru Technological University Hyderabad';
    const letters = (indianUniversities.match(/\p{L}/gu) ?? []).length;
    const words = (indianUniversities.toLowerCase().match(/[\p{L}']+/gu) ?? []).length;
    expect(letters / words).toBeGreaterThan(9.4);

    // ...and yet it is not treated as foreign.
    expect(findNonEnglishSegments(indianUniversities).hasNonEnglishSegment).toBe(false);
  });

  it('and the German block it exists to catch contains no English institution word', () => {
    // Why the exemption does not weaken the signal it guards: German, Dutch and
    // Swedish use Universitaet / Hogeschool / Handelshoegskolan.
    const german = `Kenntnisse: Lagerverwaltung, Bedarfsplanung, Tourenplanung, Bestandskontrolle
Ausbildung: Diplom Logistikmanagement, Universitaet Koeln`;
    expect(findNonEnglishSegments(german).hasNonEnglishSegment).toBe(true);
  });
});

describe('sub-floor foreign inserts (H-085)', () => {
  const englishBody = [
    'Marisol Okonkwo',
    'Senior Data Engineer, Northwind Freight, Jan 2023 - Dec 2025',
    'Built streaming pipelines in Python for shipment tracking and reconciliation.',
    'Ran the Docker based deployment platform used by four delivery teams.',
    'Owned the data quality programme covering nine downstream reporting systems.',
  ];
  const withInsert = (line: string) => [...englishBody, line].join('\n');

  it('CLOSED for Romance: a one-line Spanish degree is caught', () => {
    // ~70 letters — far below the ~100-letter window floor, so no window can
    // isolate it. This is the exact attribute that flipped eligibility in the
    // original H-041 reproduction, which is why it was worth closing.
    const document = withInsert(
      'Licenciatura en Ciencias de la Computacion, Universidad de Salamanca',
    );
    expect(findNonEnglishSegments(document).hasNonEnglishSegment).toBe(true);
  });

  it('CLOSED for Romance: a one-line French insert is caught', () => {
    expect(
      findNonEnglishSegments(withInsert('Encadrement d une equipe de six personnes')),
    ).toHaveProperty('hasNonEnglishSegment', true);
  });

  it('DOCUMENTED GAP: a Germanic sub-floor insert is still SCORED', () => {
    // Asserts the WRONG behaviour on purpose so it cannot be lost (H-085).
    // Germanic compound-noun lines contain no function words at all, and mean
    // word length cannot rescue them at line level — English lines reach 11.3
    // there ("Additional: Conversational Portuguese"), so the classes do not
    // separate on 3-5 words. Closing this needs the language-ID library.
    const document = withInsert('Kenntnisse: Lagerverwaltung, Bedarfsplanung');
    expect(findNonEnglishSegments(document).hasNonEnglishSegment).toBe(false);
    expect(detectLanguageHeuristic(document).isEnglish).toBe(true);
  });
});
