// Corpora copied verbatim from
// apps/server/src/ingestion/languageDetection.eval.test.ts (read 2026-08-14).
// Used only to measure candidate npm language-ID libraries; not executed
// against the repo itself (this whole spike dir is outside the repo).

export const ENGLISH_CVS = {
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

export const HELD_OUT_ENGLISH_CVS = {
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

export const INDIAN_ENGLISH_CVS = {
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

// ---------------------------------------------------------------------------
// Germanic sub-floor MUST-BE-NON-ENGLISH lines.
//
// `kenntnisse_lagerverwaltung` is the exact string from the DOCUMENTED GAP
// test at languageDetection.eval.test.ts:591-599 (H-085). The rest are
// constructed in the same shape as the DE/NL/SV header blocks already in the
// eval file (languageDetection.ts:352-359, eval.test.ts:472-507): CV
// header/skill/degree lines, 3-8 words, built from real compound nouns in
// each language (warehouse/logistics/engineering/business domain, matching
// the CV domain), no function words (no "der/die/das/en/het/och/och" etc.),
// title-cased the way a CV header line would be. Each was checked by hand
// against a bilingual dictionary for plausibility, not machine-translated
// from a single source sentence, so they are not near-duplicates of each
// other or of the existing eval-file lines.
// ---------------------------------------------------------------------------
export const GERMANIC_SUBFLOOR_LINES = {
  // Exact string from the DOCUMENTED GAP test (eval.test.ts:597).
  de_kenntnisse_lagerverwaltung: 'Kenntnisse: Lagerverwaltung, Bedarfsplanung',
  de_ausbildung_wirtschaftsingenieurwesen:
    'Ausbildung: Wirtschaftsingenieurwesen, Fachhochschule Muenchen',
  de_berufserfahrung_softwareentwicklung:
    'Berufserfahrung: Softwareentwicklung, Systemintegration',
  de_qualifikationen_projektmanagement:
    'Qualifikationen: Projektmanagement, Qualitaetssicherung',
  de_schwerpunkte_maschinenbau: 'Schwerpunkte: Maschinenbau, Fertigungstechnik',

  nl_vaardigheden_voorraadbeheer: 'Vaardigheden: Voorraadbeheer, Orderverwerking',
  nl_opleiding_bedrijfskunde: 'Opleiding: Bedrijfskunde, Hogeschool Rotterdam',
  nl_werkervaring_softwareontwikkeling: 'Werkervaring: Softwareontwikkeling, Systeembeheer',
  nl_kwalificaties_projectmanagement: 'Kwalificaties: Projectmanagement, Kwaliteitscontrole',

  sv_kompetens_lagerhantering: 'Kompetens: Lagerhantering, Orderhantering',
  sv_utbildning_civilingenjor: 'Utbildning: Civilingenjoer, Kungliga Tekniska Hoegskolan',
  sv_erfarenhet_mjukvaruutveckling: 'Erfarenhet: Mjukvaruutveckling, Systemintegration',
  sv_kvalifikationer_projektledning: 'Kvalifikationer: Projektledning, Kvalitetssaekring',
};

// Known hard English lines (documented in ADR-030 / languageDetection.ts as
// the narrowest margin the existing detector has).
export const KNOWN_HARD_ENGLISH_LINES = {
  additional_conversational_portuguese: 'Additional: Conversational Portuguese',
  headers_plus_tech_only_skills: 'Skills: AWS, GCP, Terraform, Ansible, Docker, Kubernetes, Python, Bash',
  headers_plus_tech_only_education: 'Education: BS, Information Technology',
};
