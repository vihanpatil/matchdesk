import {
  ENGLISH_CVS, HELD_OUT_ENGLISH_CVS, INDIAN_ENGLISH_CVS,
  GERMANIC_SUBFLOOR_LINES, ENGLISH_BODY_FOR_SUBFLOOR,
} from './corpora.mjs';
import { segmentsFor, condition, linesWithOffsets } from './segmentation.mjs';

const SPIKE_ELD = '/private/tmp/claude-501/-Users-vihanpatil-personal-projects-Resume-Match/03221b5a-e8b7-471c-8d49-a8e92397019d/scratchpad/dep-analyst/spike/node_modules/eld';
const TIERS = {
  extrasmall: (await import(`${SPIKE_ELD}/src/entries/static.extrasmall.js`)).eld,
  small: (await import(`${SPIKE_ELD}/src/entries/static.small.js`)).eld,
  medium: (await import(`${SPIKE_ELD}/src/entries/static.medium.js`)).eld,
  large: (await import(`${SPIKE_ELD}/src/entries/static.large.js`)).eld,
};

const ALL_ENGLISH_CVS = { ...ENGLISH_CVS, ...HELD_OUT_ENGLISH_CVS, ...INDIAN_ENGLISH_CVS };

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

function inspect(granularity, conditioning, tierName, reliableFilter) {
  const eld = TIERS[tierName];
  console.log(`\n### ${granularity}/${conditioning}/${tierName}/reliableFilter=${reliableFilter}`);
  console.log('-- English CV false refusals (segment-level detail) --');
  for (const [label, text] of Object.entries(ALL_ENGLISH_CVS)) {
    const segments = segmentsFor(granularity, text);
    for (const seg of segments) {
      const r = classifySegment(eld, seg.text, conditioning, reliableFilter);
      if (r.verdict === 'other') {
        console.log(`  CV=${label}  seg="${seg.text.slice(0,80).replace(/\n/g,'\\n')}"  code=${r.code} reliable=${r.reliable}`);
      }
    }
  }
  console.log('-- Germanic sub-floor misses --');
  for (const [label, line] of Object.entries(GERMANIC_SUBFLOOR_LINES)) {
    const doc = [...ENGLISH_BODY_FOR_SUBFLOOR, line].join('\n');
    const docLines = linesWithOffsets(doc);
    const insertLine = docLines[docLines.length - 1];
    const segments = segmentsFor(granularity, doc);
    const overlapping = segments.filter((seg) => seg.start < insertLine.end && seg.end > insertLine.start);
    const results = overlapping.map((seg) => ({ seg: seg.text, ...classifySegment(eld, seg.text, conditioning, reliableFilter) }));
    const caught = results.some((r) => r.verdict === 'other');
    if (!caught) {
      console.log(`  MISSED ${label}: "${line}"`);
      for (const r of results) console.log(`    overlapping seg="${r.seg.slice(0,80).replace(/\n/g,'\\n')}" code=${r.code} reliable=${r.reliable} verdict=${r.verdict}`);
    }
  }
}

inspect('lines', 'raw', 'extrasmall', true);
inspect('lines', 'raw', 'small', true);
inspect('lines', 'raw', 'medium', true);
inspect('lines', 'raw', 'large', true);
inspect('sentences', 'raw', 'small', true);
