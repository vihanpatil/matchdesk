// Empirical spike: measure franc / franc-min / franc-all / tinyld(light,
// normal, heavy) / eld / cld3-asm at SINGLE-LINE granularity against:
//   (a) every line of ENGLISH_CVS + HELD_OUT_ENGLISH_CVS + INDIAN_ENGLISH_CVS
//       -> must NOT be classified non-English (false-refusal check)
//   (b) GERMANIC_SUBFLOOR_LINES (H-085's open gap)
//       -> MUST be classified non-English (catch-rate check)
//   (c) behaviour below each library's documented minimum input length.
//
// Run: node measure.mjs

import { franc as francFull } from 'franc';
import { franc as francMin } from 'franc-min';
import { franc as francAll } from 'franc-all';
import { detect as tinyldLight } from 'tinyld/light';
import { detect as tinyldNormal } from 'tinyld';
import { detect as tinyldHeavy } from 'tinyld/heavy';
// Static "large" entrypoint: pre-loaded database, no async .load() step
// needed. The dynamic entrypoint (`import { eld } from 'eld'`) requires an
// explicit `await eld.load('large')` before first use and throws "No
// database loaded, use load()" otherwise — documented as real behavior
// below, not worked around silently.
import { eld } from 'eld/large';
import { loadModule } from 'cld3-asm';

import {
  ENGLISH_CVS,
  HELD_OUT_ENGLISH_CVS,
  INDIAN_ENGLISH_CVS,
  GERMANIC_SUBFLOOR_LINES,
  KNOWN_HARD_ENGLISH_LINES,
} from './corpora.mjs';

function linesOf(corpus) {
  const out = [];
  for (const [cvLabel, text] of Object.entries(corpus)) {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    lines.forEach((line, i) => out.push({ cvLabel, lineIndex: i, line }));
  }
  return out;
}

const englishLines = [
  ...linesOf(ENGLISH_CVS),
  ...linesOf(HELD_OUT_ENGLISH_CVS),
  ...linesOf(INDIAN_ENGLISH_CVS),
];

const germanicLines = Object.entries(GERMANIC_SUBFLOOR_LINES).map(([label, line]) => ({
  cvLabel: label,
  lineIndex: 0,
  line,
}));

const hardEnglishLines = Object.entries(KNOWN_HARD_ENGLISH_LINES).map(([label, line]) => ({
  cvLabel: label,
  lineIndex: 0,
  line,
}));

const cld3Factory = await loadModule();
const cld3Identifier = cld3Factory.create(0, 512);

// ---- Candidate classifiers -------------------------------------------------
// Each returns { verdict: 'en' | 'other' | 'und', raw } where 'und' means the
// library declined to guess (undetermined / empty result).

const candidates = {
  franc: (text) => {
    const code = francFull(text); // default minLength=10 chars
    return { verdict: code === 'und' ? 'und' : code === 'eng' ? 'en' : 'other', raw: code };
  },
  'franc-min': (text) => {
    const code = francMin(text);
    return { verdict: code === 'und' ? 'und' : code === 'eng' ? 'en' : 'other', raw: code };
  },
  'franc-all': (text) => {
    const code = francAll(text);
    return { verdict: code === 'und' ? 'und' : code === 'eng' ? 'en' : 'other', raw: code };
  },
  'tinyld/light': (text) => {
    const code = tinyldLight(text);
    return { verdict: code === '' ? 'und' : code === 'en' ? 'en' : 'other', raw: JSON.stringify(code) };
  },
  'tinyld (normal)': (text) => {
    const code = tinyldNormal(text);
    return { verdict: code === '' ? 'und' : code === 'en' ? 'en' : 'other', raw: JSON.stringify(code) };
  },
  'tinyld/heavy': (text) => {
    const code = tinyldHeavy(text);
    return { verdict: code === '' ? 'und' : code === 'en' ? 'en' : 'other', raw: JSON.stringify(code) };
  },
  eld: (text) => {
    const result = eld.detect(text);
    const code = result.language;
    return {
      verdict: code === '' ? 'und' : code === 'en' ? 'en' : 'other',
      raw: `${JSON.stringify(code)} reliable=${String(result.isReliable())}`,
    };
  },
  'cld3-asm': (text) => {
    const result = cld3Identifier.findLanguage(text);
    const code = result.language; // 'und' when unreliable
    return {
      verdict: code === 'und' ? 'und' : code === 'en' ? 'en' : 'other',
      raw: `${code} p=${result.probability.toFixed(2)} reliable=${String(result.is_reliable)}`,
    };
  },
};

function runSet(rows, mustBe) {
  // mustBe: 'en' for the English corpora (nonEnglish verdict = failure),
  //         'other' for the Germanic sub-floor set (en/und verdict = miss).
  const results = {};
  for (const [name, classify] of Object.entries(candidates)) {
    const failures = [];
    let thrown = 0;
    for (const row of rows) {
      let verdict, raw;
      try {
        ({ verdict, raw } = classify(row.line));
      } catch (err) {
        thrown++;
        failures.push({ ...row, verdict: 'THREW', raw: String(err && err.message) });
        continue;
      }
      const ok = mustBe === 'en' ? verdict === 'en' : verdict === 'other';
      if (!ok) failures.push({ ...row, verdict, raw });
    }
    results[name] = { total: rows.length, failures, thrown };
  }
  return results;
}

console.log('='.repeat(80));
console.log(`English-corpus lines: ${englishLines.length} (must classify EN; failure = false refusal)`);
console.log('='.repeat(80));
const englishResults = runSet(englishLines, 'en');
for (const [name, r] of Object.entries(englishResults)) {
  const nOk = r.total - r.failures.length;
  console.log(`\n[${name}] ${nOk}/${r.total} correctly EN  (${r.failures.length} false refusals, ${r.thrown} threw)`);
  for (const f of r.failures) {
    console.log(`  FALSE REFUSAL  ${f.cvLabel}#${f.lineIndex}  verdict=${f.verdict}  raw=${f.raw}  text="${f.line.slice(0, 70)}"`);
  }
}

console.log('\n' + '='.repeat(80));
console.log(`Germanic sub-floor lines: ${germanicLines.length} (must classify NON-English; failure = miss)`);
console.log('='.repeat(80));
const germanicResults = runSet(germanicLines, 'other');
for (const [name, r] of Object.entries(germanicResults)) {
  const nOk = r.total - r.failures.length;
  console.log(`\n[${name}] ${nOk}/${r.total} correctly caught as non-English  (${r.failures.length} missed, ${r.thrown} threw)`);
  for (const f of r.failures) {
    console.log(`  MISSED  ${f.cvLabel}  verdict=${f.verdict}  raw=${f.raw}  text="${f.line}"`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('Known hard English lines (documented in ADR-030 as the narrowest margin case)');
console.log('='.repeat(80));
for (const [name, classify] of Object.entries(candidates)) {
  console.log(`\n[${name}]`);
  for (const row of hardEnglishLines) {
    let out;
    try {
      out = classify(row.line);
    } catch (err) {
      out = { verdict: 'THREW', raw: String(err && err.message) };
    }
    console.log(`  ${row.cvLabel}: verdict=${out.verdict} raw=${out.raw}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('Below-documented-minimum-length behaviour');
console.log('='.repeat(80));
const shortInputs = ['', 'a', 'OK', 'Hi', 'Java', '123', 'BE', 'CV'];
for (const [name, classify] of Object.entries(candidates)) {
  console.log(`\n[${name}]`);
  for (const s of shortInputs) {
    let out;
    try {
      out = classify(s);
    } catch (err) {
      out = { verdict: 'THREW', raw: String(err && err.message) };
    }
    console.log(`  input=${JSON.stringify(s)} (len ${s.length}) -> verdict=${out.verdict} raw=${out.raw}`);
  }
}

// Summary table --------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('SUMMARY TABLE (n/total, never a bare percentage)');
console.log('='.repeat(80));
console.log(
  ['candidate', 'false_refusals/english_total', 'germanic_caught/germanic_total', 'threw_on_short_input']
    .join(' | '),
);
for (const name of Object.keys(candidates)) {
  const er = englishResults[name];
  const gr = germanicResults[name];
  let threwShort = 0;
  for (const s of shortInputs) {
    try {
      candidates[name](s);
    } catch {
      threwShort++;
    }
  }
  console.log(
    `${name} | ${er.failures.length}/${er.total} | ${gr.total - gr.failures.length}/${gr.total} | ${threwShort}/${shortInputs.length}`,
  );
}

cld3Identifier.dispose();

// ---------------------------------------------------------------------------
// Per-CV rollup: if this candidate were wired as a veto-only per-line judge
// (matching the existing architecture — one non-English line refuses the
// whole document), how many of the 23 English CVs contain AT LEAST ONE
// falsely-refused line?
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log('PER-CV ROLLUP: CVs with >=1 falsely-refused line (veto-only architecture cost)');
console.log('='.repeat(80));
const totalCvCount =
  Object.keys(ENGLISH_CVS).length +
  Object.keys(HELD_OUT_ENGLISH_CVS).length +
  Object.keys(INDIAN_ENGLISH_CVS).length;
for (const [name, r] of Object.entries(englishResults)) {
  const affectedCvs = new Set(r.failures.map((f) => f.cvLabel));
  console.log(`[${name}] ${affectedCvs.size}/${totalCvCount} CVs would be wrongly refused: ${[...affectedCvs].join(', ')}`);
}
