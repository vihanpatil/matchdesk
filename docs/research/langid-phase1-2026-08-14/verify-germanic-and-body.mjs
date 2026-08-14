import fs from 'node:fs';
import { GERMANIC_SUBFLOOR_LINES } from '/private/tmp/claude-501/-Users-vihanpatil-personal-projects-Resume-Match/03221b5a-e8b7-471c-8d49-a8e92397019d/scratchpad/dep-analyst/spike/corpora.mjs';

const evalTsPath = '/Users/vihanpatil/personal/projects/Resume-Match/matchdesk/apps/server/src/ingestion/languageDetection.eval.test.ts';
const src = fs.readFileSync(evalTsPath, 'utf8');

const gapLine = GERMANIC_SUBFLOOR_LINES.de_kenntnisse_lagerverwaltung;
console.log('gap line present verbatim in eval file:', src.includes(gapLine));

// extract englishBody array
const marker = 'const englishBody = [';
const start = src.indexOf(marker);
const end = src.indexOf('];', start);
const arrLiteral = src.slice(start + marker.length - 1, end + 1);
const body = eval(arrLiteral);
console.log('englishBody:', JSON.stringify(body, null, 2));
