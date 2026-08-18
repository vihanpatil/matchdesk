// H-119 measurement sweep (NEXT_PHASE item 1). Corpus first, rule sweep second.
// Rule under test ("C"): for a line OUTSIDE any recognised section, the
// function-word lexicon may only veto when the line also carries at least one
// lowercase token that is NOT in the lexicon (Romance prose always has
// lowercase content words; a name's only lowercase tokens are its particles).
import { findNonEnglishSegments } from '/Users/vihanpatil/personal/projects/Resume-Match/matchdesk/apps/server/dist/ingestion/languageDetection.js';

const body = [
  'Experience',
  'Senior Software Engineer, Meridian Analytics, 2019 to present',
  'Built and maintained data ingestion services in Python and Go.',
  'Education',
  'Bachelor of Science in Computer Science, 2015',
].join('\n');

// ---- population 1: lowercase-particle NAMES (must NOT refuse) ----
const NAMES = {
  es_del_de_la: 'Maria del Carmen Gutierrez de la Torre',
  es_de_los_del: 'Lucia de los Santos del Rio',
  es_de_la: 'Ana de la Cruz',
  es_de_la_fuente: 'Carmen de la Fuente Ortiz',
  es_short: 'Jose de la Torre',
  pt_dos_da: 'Joao Pedro dos Santos da Silva',
  nl_van_der: 'Jan van der Berg',
  nl_van_den: 'Willem van den Broek',
  fr_particle: 'Amelie le Roux de Montfort',
  es_y: 'Diego Fernandez de Cordoba y Aguilar',
};

// ---- population 2: header-block Romance PROSE (the catch the lexicon exists for; must refuse) ----
const PROSE = {
  fr_insert: 'Encadrement d une equipe de six personnes',
  fr_cover: 'Je recherche un poste de developpeuse dans une equipe agile',
  es_cover: 'Busco una oportunidad para crecer en el area de datos',
  fr_objective: 'Responsable des operations pour la region sud avec une equipe locale',
  es_summary: 'Profesional con experiencia en la gestion de proyectos para el sector bancario',
};

const LEXICON = new Set(['de','des','du','les','une','dans','pour','avec','sur','sont','aux','chez','ses','leur','la','le','el','los','las','una','para','por','del','su','sus','en','di','della','gli','nel','che','der','das','und','mit','von','dem','ein','eine','bei','auf','zur','zum','het','een','voor','aan','bij','naar','och','att','som','till','av','ett','har','hos','og','til']);

const lowercaseNonLexicon = (line) =>
  (line.match(/[\p{L}']+/gu) ?? []).filter((t) => /^\p{Ll}/u.test(t) && !LEXICON.has(t.toLowerCase()));

console.log('== current behaviour (header placement: line above the first section) ==');
for (const [pop, set, wantRefused] of [['NAME', NAMES, false], ['PROSE', PROSE, true]]) {
  for (const [label, line] of Object.entries(set)) {
    const r = findNonEnglishSegments(`${line}\n${body}`);
    const ok = r.hasNonEnglishSegment === wantRefused ? 'ok    ' : 'WRONG ';
    const ruleC = lowercaseNonLexicon(line);
    console.log(`${ok} ${pop} ${label}: refused=${r.hasNonEnglishSegment} | ruleC lowercase-non-lexicon tokens: [${ruleC.join(',')}] -> lexicon ${ruleC.length > 0 ? 'MAY veto' : 'would SKIP'}`);
  }
}
