import fs from 'node:fs';
import * as analyst from '/private/tmp/claude-501/-Users-vihanpatil-personal-projects-Resume-Match/03221b5a-e8b7-471c-8d49-a8e92397019d/scratchpad/dep-analyst/spike/corpora.mjs';

const real = JSON.parse(fs.readFileSync('./extracted-from-real-eval.json', 'utf8'));

function compare(name, realObj, analystObj) {
  const realKeys = Object.keys(realObj).sort();
  const aKeys = Object.keys(analystObj).sort();
  const keyMismatch = JSON.stringify(realKeys) !== JSON.stringify(aKeys);
  const diffs = [];
  for (const k of realKeys) {
    if (!(k in analystObj)) { diffs.push(`MISSING key ${k} in analyst`); continue; }
    if (realObj[k] !== analystObj[k]) diffs.push(`TEXT MISMATCH at key ${k}`);
  }
  console.log(`[${name}] keyMismatch=${keyMismatch} textDiffs=${diffs.length}`);
  if (keyMismatch) console.log('  real keys:', realKeys, 'analyst keys:', aKeys);
  diffs.forEach(d => console.log('  ' + d));
}

compare('ENGLISH_CVS', real.ENGLISH_CVS, analyst.ENGLISH_CVS);
compare('HELD_OUT_ENGLISH_CVS', real.HELD_OUT_ENGLISH_CVS, analyst.HELD_OUT_ENGLISH_CVS);
compare('INDIAN_ENGLISH_CVS', real.INDIAN_ENGLISH_CVS, analyst.INDIAN_ENGLISH_CVS);
