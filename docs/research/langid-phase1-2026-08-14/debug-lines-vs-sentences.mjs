import { ENGLISH_CVS, HELD_OUT_ENGLISH_CVS, INDIAN_ENGLISH_CVS } from './corpora.mjs';
import { segmentsFor } from './segmentation.mjs';
const ALL = { ...ENGLISH_CVS, ...HELD_OUT_ENGLISH_CVS, ...INDIAN_ENGLISH_CVS };
for (const [label, text] of Object.entries(ALL)) {
  const l = segmentsFor('lines', text).length;
  const s = segmentsFor('sentences', text).length;
  if (l !== s) console.log(label, 'lines=', l, 'sentences=', s);
}
console.log('done - any CV not printed above has identical segment counts under both granularities');
