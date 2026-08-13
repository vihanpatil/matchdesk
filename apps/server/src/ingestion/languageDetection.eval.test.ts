import { describe, expect, it } from 'vitest';

import { detectLanguageHeuristic } from './languageDetection.js';

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

  it('KNOWN LIMITATION: a code-switched (bilingual) document is judged as one blob, not per-section', () => {
    const text =
      'Jordan Rivera is a software engineer with five years of experience. Jordan a dirige des migrations vers des microservices et encadre des ingenieurs juniors dans une equipe.';
    const result = detectLanguageHeuristic(text);
    // Whichever language's statistics happen to dominate wins; this asserts
    // the actual current output so a change in behaviour is visible, not a
    // guarantee that this is the "right" answer for a mixed document.
    expect(result.isEnglish).toBe(true);
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
