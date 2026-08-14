// Phase 1 measurement harness (read-only w.r.t. the repo -- writes nothing
// there, installs nothing, imports eld only from the dep-analyst's already
// -installed scratch node_modules).
//
// Sweeps: granularity x conditioning x ngram-tier x reliable-filter.
// Reports n/total counts, never bare percentages, per the tiger-team rules.

import {
  ENGLISH_CVS,
  HELD_OUT_ENGLISH_CVS,
  INDIAN_ENGLISH_CVS,
  NON_ENGLISH_CVS,
  HELD_OUT_NON_ENGLISH_CVS,
  GERMANIC_SUBFLOOR_LINES,
  ENGLISH_BODY_FOR_SUBFLOOR,
} from './corpora.mjs';
import { segmentsFor, condition, linesWithOffsets } from './segmentation.mjs';

const SPIKE_ELD = '/private/tmp/claude-501/-Users-vihanpatil-personal-projects-Resume-Match/03221b5a-e8b7-471c-8d49-a8e92397019d/scratchpad/dep-analyst/spike/node_modules/eld';

const TIERS = {
  extrasmall: (await import(`${SPIKE_ELD}/src/entries/static.extrasmall.js`)).eld,
  small: (await import(`${SPIKE_ELD}/src/entries/static.small.js`)).eld,
  medium: (await import(`${SPIKE_ELD}/src/entries/static.medium.js`)).eld,
  large: (await import(`${SPIKE_ELD}/src/entries/static.large.js`)).eld,
};

const GRANULARITIES = ['windows100', 'lines', 'linePairs', 'sentences'];
const CONDITIONINGS = ['raw', 'stripped'];
const RELIABLE_FILTERS = [false, true];

const ALL_ENGLISH_CVS = { ...ENGLISH_CVS, ...HELD_OUT_ENGLISH_CVS, ...INDIAN_ENGLISH_CVS };
const ALL_NON_ENGLISH_CVS = { ...NON_ENGLISH_CVS, ...HELD_OUT_NON_ENGLISH_CVS };
const ENGLISH_TOTAL = Object.keys(ALL_ENGLISH_CVS).length; // expect 23
const NON_ENGLISH_TOTAL = Object.keys(ALL_NON_ENGLISH_CVS).length; // expect 13
const GERMANIC_TOTAL = Object.keys(GERMANIC_SUBFLOOR_LINES).length; // expect 13

if (ENGLISH_TOTAL !== 23) throw new Error(`expected 23 English CVs, got ${ENGLISH_TOTAL}`);
if (NON_ENGLISH_TOTAL !== 13) throw new Error(`expected 13 non-English CVs, got ${NON_ENGLISH_TOTAL}`);
if (GERMANIC_TOTAL !== 13) throw new Error(`expected 13 Germanic sub-floor lines, got ${GERMANIC_TOTAL}`);

/** verdict: 'en' | 'other' | 'und' (abstain -- too short / unreliable-and-filtered) */
function classifySegment(eld, rawSegmentText, conditioning, reliableFilter) {
  const text = condition(conditioning, rawSegmentText);
  if (text.trim().length === 0) return { verdict: 'und', code: '', reliable: null };
  const result = eld.detect(text);
  const code = result.language;
  const reliable = result.isReliable();
  if (code === '') return { verdict: 'und', code, reliable };
  if (reliableFilter && !reliable) return { verdict: 'und', code, reliable };
  return { verdict: code === 'en' ? 'en' : 'other', code, reliable };
}

/** Does ANY segment of `text` at this config classify 'other'? */
function docHasForeignSegment(eld, text, granularity, conditioning, reliableFilter) {
  const segments = segmentsFor(granularity, text);
  for (const seg of segments) {
    const { verdict } = classifySegment(eld, seg.text, conditioning, reliableFilter);
    if (verdict === 'other') return true;
  }
  return false;
}

const rows = [];

for (const granularity of GRANULARITIES) {
  for (const conditioning of CONDITIONINGS) {
    for (const tierName of Object.keys(TIERS)) {
      const eld = TIERS[tierName];
      for (const reliableFilter of RELIABLE_FILTERS) {
        // --- English CVs: count docs with >=1 falsely-refused segment ---
        const falselyRefusedCvs = [];
        for (const [label, text] of Object.entries(ALL_ENGLISH_CVS)) {
          if (docHasForeignSegment(eld, text, granularity, conditioning, reliableFilter)) {
            falselyRefusedCvs.push(label);
          }
        }

        // --- Non-English CVs: count docs still refused (>=1 'other' segment) ---
        const stillRefused = [];
        for (const [label, text] of Object.entries(ALL_NON_ENGLISH_CVS)) {
          if (docHasForeignSegment(eld, text, granularity, conditioning, reliableFilter)) {
            stillRefused.push(label);
          }
        }

        // --- Germanic sub-floor lines: catch rate, embedded in real English
        //     context exactly like the H-085 test does, so window/pair/
        //     sentence granularities are tested under real dilution.
        //     "Caught" = at least one segment that OVERLAPS the inserted
        //     line's own character span is classified 'other'. This is
        //     deliberately precise (not "any segment in the doc is foreign")
        //     so it cannot be confounded by the English body itself being
        //     noisy at this config -- that is tracked separately as
        //     `bodyAloneFalseAlarm`, an English-safety signal, not a
        //     germanic-catch signal. ---
        const bodyAlone = ENGLISH_BODY_FOR_SUBFLOOR.join('\n');
        const bodyAloneHasForeign = docHasForeignSegment(
          eld, bodyAlone, granularity, conditioning, reliableFilter,
        );
        const caughtLines = [];
        for (const [label, line] of Object.entries(GERMANIC_SUBFLOOR_LINES)) {
          const doc = [...ENGLISH_BODY_FOR_SUBFLOOR, line].join('\n');
          const docLines = linesWithOffsets(doc);
          const insertLine = docLines[docLines.length - 1]; // the appended line
          const segments = segmentsFor(granularity, doc);
          const overlapping = segments.filter(
            (seg) => seg.start < insertLine.end && seg.end > insertLine.start,
          );
          const caught = overlapping.some(
            (seg) => classifySegment(eld, seg.text, conditioning, reliableFilter).verdict === 'other',
          );
          if (caught) caughtLines.push(label);
        }

        rows.push({
          granularity,
          conditioning,
          tier: tierName,
          reliableFilter,
          germanicCaught: caughtLines.length,
          germanicTotal: GERMANIC_TOTAL,
          englishFalselyRefused: falselyRefusedCvs.length,
          englishTotal: ENGLISH_TOTAL,
          nonEnglishRefused: stillRefused.length,
          nonEnglishTotal: NON_ENGLISH_TOTAL,
          headersPlusTechOnlyPasses: !falselyRefusedCvs.includes('headers_plus_tech_only'),
          amritaCasesPass:
            !falselyRefusedCvs.includes('mixed_unis') && !falselyRefusedCvs.includes('uni_lines_only'),
          falselyRefusedCvLabels: falselyRefusedCvs,
          missedNonEnglishLabels: Object.keys(ALL_NON_ENGLISH_CVS).filter((l) => !stillRefused.includes(l)),
          bodyAloneFalseAlarm: bodyAloneHasForeign,
        });
      }
    }
  }
}

// ---- Print full sweep table ----
console.log('='.repeat(140));
console.log('FULL SWEEP: granularity x conditioning x tier x reliableFilter');
console.log('='.repeat(140));
const header = [
  'granularity'.padEnd(11),
  'condition'.padEnd(9),
  'tier'.padEnd(10),
  'relOnly'.padEnd(7),
  'germanic'.padEnd(9),
  'engFalseRef'.padEnd(12),
  'nonEngRefused'.padEnd(14),
  'headersPass'.padEnd(11),
  'amritaPass'.padEnd(10),
  'bodyFalseAlarm',
].join(' | ');
console.log(header);
console.log('-'.repeat(140));
for (const r of rows) {
  console.log(
    [
      r.granularity.padEnd(11),
      r.conditioning.padEnd(9),
      r.tier.padEnd(10),
      String(r.reliableFilter).padEnd(7),
      `${r.germanicCaught}/${r.germanicTotal}`.padEnd(9),
      `${r.englishFalselyRefused}/${r.englishTotal}`.padEnd(12),
      `${r.nonEnglishRefused}/${r.nonEnglishTotal}`.padEnd(14),
      String(r.headersPlusTechOnlyPasses).padEnd(11),
      String(r.amritaCasesPass).padEnd(10),
      String(r.bodyAloneFalseAlarm),
    ].join(' | '),
  );
}

// ---- Highlight fully-clean configs ----
console.log('\n' + '='.repeat(140));
console.log('CONFIGS MEETING THE BAR: germanic 13/13 AND englishFalseRef 0/23 AND nonEnglishRefused 13/13');
console.log('='.repeat(140));
const clean = rows.filter(
  (r) =>
    r.germanicCaught === r.germanicTotal &&
    r.englishFalselyRefused === 0 &&
    r.nonEnglishRefused === r.nonEnglishTotal,
);
if (clean.length === 0) {
  console.log('NONE.');
} else {
  for (const r of clean) {
    console.log(
      `${r.granularity} / ${r.conditioning} / ${r.tier} / reliableFilter=${r.reliableFilter} -- headersPass=${r.headersPlusTechOnlyPasses} amritaPass=${r.amritaCasesPass}`,
    );
  }
}

// ---- Best-effort (closest) configs when nothing is fully clean ----
console.log('\n' + '='.repeat(140));
console.log('CLOSEST CONFIGS (sorted by englishFalselyRefused asc, then germanic missed asc)');
console.log('='.repeat(140));
const sorted = [...rows].sort((a, b) => {
  const aMissed = a.germanicTotal - a.germanicCaught;
  const bMissed = b.germanicTotal - b.germanicCaught;
  if (a.englishFalselyRefused !== b.englishFalselyRefused) return a.englishFalselyRefused - b.englishFalselyRefused;
  if (aMissed !== bMissed) return aMissed - bMissed;
  return (a.nonEnglishTotal - a.nonEnglishRefused) - (b.nonEnglishTotal - b.nonEnglishRefused);
});
for (const r of sorted.slice(0, 10)) {
  console.log(
    `${r.granularity}/${r.conditioning}/${r.tier}/relOnly=${r.reliableFilter}  germanic=${r.germanicCaught}/${r.germanicTotal}  engFalseRef=${r.englishFalselyRefused}/${r.englishTotal} [${r.falselyRefusedCvLabels.join(',')}]  nonEngRefused=${r.nonEnglishRefused}/${r.nonEnglishTotal} missed=[${r.missedNonEnglishLabels.join(',')}]`,
  );
}

console.log('\nDone.');
