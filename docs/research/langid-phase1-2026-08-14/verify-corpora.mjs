import fs from 'node:fs';
import vm from 'node:vm';

const evalTsPath = '/Users/vihanpatil/personal/projects/Resume-Match/matchdesk/apps/server/src/ingestion/languageDetection.eval.test.ts';
const src = fs.readFileSync(evalTsPath, 'utf8');

function extractConst(name) {
  const marker = `const ${name}: Record<string, string> = {`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('marker not found: ' + name);
  let i = start + marker.length - 1; // at the opening brace
  let depth = 0;
  let inTemplate = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '`') inTemplate = !inTemplate;
    if (inTemplate) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const objLiteral = src.slice(start + marker.length - 1, i);
  const code = `(${objLiteral})`;
  return vm.runInNewContext(code, {});
}

const names = ['ENGLISH_CVS', 'HELD_OUT_ENGLISH_CVS', 'INDIAN_ENGLISH_CVS', 'NON_ENGLISH_CVS', 'HELD_OUT_NON_ENGLISH_CVS'];
const extracted = {};
for (const n of names) {
  extracted[n] = extractConst(n);
  console.log(n, 'keys:', Object.keys(extracted[n]));
}

fs.writeFileSync('./extracted-from-real-eval.json', JSON.stringify(extracted, null, 2));
console.log('WROTE extracted-from-real-eval.json');
