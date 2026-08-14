// Full corpora for the eld measurement harness (Phase 1, langdet role).
//
// ENGLISH_CVS / HELD_OUT_ENGLISH_CVS / INDIAN_ENGLISH_CVS: copied from the
// dep-analyst's spike/corpora.mjs, which was PROGRAMMATICALLY DIFFED against
// the real apps/server/src/ingestion/languageDetection.eval.test.ts (see
// verify-corpora.mjs / diff-check.mjs in this directory) -- 0 key mismatches,
// 0 text diffs across all three objects.
//
// NON_ENGLISH_CVS / HELD_OUT_NON_ENGLISH_CVS: extracted PROGRAMMATICALLY from
// the real eval test file by verify-corpora.mjs (balanced-brace scan of the
// TS source, then evaluated as a plain object literal) -- not hand-copied,
// so there is no transcription step to distrust.
//
// GERMANIC_SUBFLOOR_LINES: copied from the dep-analyst's spike/corpora.mjs.
// The de_kenntnisse_lagerverwaltung line was verified to appear verbatim in
// the real eval file (H-085's "DOCUMENTED GAP" test, eval.test.ts:597). The
// other 12 lines are NOT in the real eval file (H-085 only asserts the one
// documented case) -- they are the dep-analyst's own constructed corpus,
// unverifiable against a "real" source because no such source exists in the
// repo. Flagged as unverified provenance for those 12.
//
// ENGLISH_BODY_FOR_SUBFLOOR: copied verbatim from the real eval file's
// 'sub-floor foreign inserts (H-085)' describe block (eval.test.ts ~566-572),
// verified programmatically (verify-germanic-and-body.mjs).

export { ENGLISH_CVS, HELD_OUT_ENGLISH_CVS, INDIAN_ENGLISH_CVS } from '../dep-analyst/spike/corpora.mjs';
export { GERMANIC_SUBFLOOR_LINES } from '../dep-analyst/spike/corpora.mjs';

export const NON_ENGLISH_CVS = {
  french: `Alex Fontaine est développeuse chez Solmédia depuis quatre ans. Elle a construit des services back-end en Python et Go, et a participé à la migration vers une architecture de microservices. Alex encadre deux stagiaires et collabore avec l'équipe produit chaque semaine. Elle est titulaire d'un master en informatique obtenu à Lyon.`,

  german: `Nadine Brandt arbeitet seit fünf Jahren als Softwareentwicklerin bei Kernwerk GmbH. Sie hat Backend-Dienste in Java und Kotlin entwickelt und den Übergang zu einer Microservice-Architektur begleitet. Nadine betreut zwei Praktikanten und arbeitet eng mit dem Produktteam zusammen. Sie hat einen Masterabschluss in Informatik von der Technischen Universität München.`,

  spanish: `Carlos Iturbe trabaja como desarrollador de software en Tecnova desde hace seis años. Ha construido servicios backend en Python y Java, y participó en la migración hacia una arquitectura de microservicios. Carlos supervisa a dos becarios y colabora de cerca con el equipo de producto. Tiene una maestría en ciencias de la computación.`,

  italian: `Giulia Ferraro lavora come sviluppatrice software presso Vertico da cinque anni. Ha costruito servizi backend in Python e Java e ha partecipato alla migrazione verso un'architettura a microservizi. Giulia segue due tirocinanti e collabora strettamente con il team di prodotto. Ha conseguito una laurea magistrale in informatica.`,

  dutch: `Sanne de Vries werkt sinds vier jaar als softwareontwikkelaar bij Bloemveld. Ze heeft backend-diensten gebouwd in Python en Java en heeft meegewerkt aan de overstap naar een microservicearchitectuur. Sanne begeleidt twee stagiairs en werkt nauw samen met het productteam. Ze heeft een masterdiploma in informatica behaald.`,

  danish: `Mette Holm har arbejdet som softwareudvikler hos Nordbyg i fire år. Hun har bygget backend-tjenester i Python og Java og har deltaget i overgangen til en mikroservicearkitektur. Mette vejleder to praktikanter og samarbejder tæt med produktteamet. Hun har en kandidatgrad i datalogi.`,

  norwegian: `Kristoffer Aas har jobbet som programvareutvikler hos Fjellkode i fire år. Han har bygget backend-tjenester i Python og Java og har deltatt i overgangen til en mikrotjenestearkitektur. Kristoffer veileder to praktikanter og samarbeider tett med produktteamet. Han har en mastergrad i informatikk.`,

  swedish: `Elin Sjöberg har arbetat som mjukvaruutvecklare på Norrkod i fyra år. Hon har byggt backend-tjänster i Python och Java och har deltagit i övergången till en mikrotjänstarkitektur. Elin handleder två praktikanter och samarbetar nära med produktteamet. Hon har en masterexamen i datavetenskap.`,

  french_unaccented: `Jordan Rivera est ingenieur logiciel avec cinq ans d'experience dans la creation de systemes back-end en Python et Go. Jordan a dirige des migrations vers des microservices et encadre des ingenieurs juniors dans une equipe de dix personnes.`,
};

export const HELD_OUT_NON_ENGLISH_CVS = {
  german_nurse: `Bernadette Achebe ist eine erfahrene Krankenschwester mit elf Jahren Erfahrung in der Herzintensivpflege. Sie hat Nachtschichten auf einer Station mit dreißig Betten übernommen und mit Fachärzten zusammengearbeitet.`,
  spanish_teacher: `Hollis Marchetti ha enseñado matemáticas en secundaria durante nueve años en dos institutos. Actualmente dirige el programa de refuerzo y trabaja con alumnos que llegan por debajo del nivel esperado.`,
  dutch_accountant: `Winifred Osei-Bonsu is een registeraccountant gespecialiseerd in wettelijke controles voor middelgrote productiebedrijven. Zij heeft controleopdrachten geleid van planning tot afronding.`,
  swedish_chef: `Dmitri Karalis har arbetat som köksmästare i tolv år och lett ett team på fjorton personer under två serveringar varje dag. Han har minskat matsvinnet med en tredjedel.`,
};

// Verbatim from languageDetection.eval.test.ts, 'sub-floor foreign inserts
// (H-085)' describe block -- the exact context a Germanic sub-floor line is
// inserted into for the DOCUMENTED GAP test.
export const ENGLISH_BODY_FOR_SUBFLOOR = [
  'Marisol Okonkwo',
  'Senior Data Engineer, Northwind Freight, Jan 2023 - Dec 2025',
  'Built streaming pipelines in Python for shipment tracking and reconciliation.',
  'Ran the Docker based deployment platform used by four delivery teams.',
  'Owned the data quality programme covering nine downstream reporting systems.',
];
