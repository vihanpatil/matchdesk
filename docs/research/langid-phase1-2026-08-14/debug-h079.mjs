// Verifies whether eld at WINDOW granularity catches the H-079 German-header
// block case (languageDetection.eval.test.ts:472-507), which in production
// is caught by MAX_ENGLISH_MEAN_WORD_LENGTH + ENGLISH_INSTITUTION_WORDS, NOT
// by the n-gram profile itself (the profile mis-reads it as English).
import { segmentsFor, condition } from './segmentation.mjs';

const SPIKE_ELD = '/private/tmp/claude-501/-Users-vihanpatil-personal-projects-Resume-Match/03221b5a-e8b7-471c-8d49-a8e92397019d/scratchpad/dep-analyst/spike/node_modules/eld';
const TIERS = {
  extrasmall: (await import(`${SPIKE_ELD}/src/entries/static.extrasmall.js`)).eld,
  small: (await import(`${SPIKE_ELD}/src/entries/static.small.js`)).eld,
  medium: (await import(`${SPIKE_ELD}/src/entries/static.medium.js`)).eld,
  large: (await import(`${SPIKE_ELD}/src/entries/static.large.js`)).eld,
};

function classify(eld, text, conditioning, reliableFilter) {
  const t = condition(conditioning, text);
  if (t.trim().length === 0) return 'und';
  const r = eld.detect(t);
  if (r.language === '') return 'und';
  if (reliableFilter && !r.isReliable()) return 'und';
  return r.language === 'en' ? 'en' : 'other';
}

const english = [
  'Skills: Warehouse Management, SAP, Forecasting, Route Planning, Inventory Control',
  'Systems: Oracle WMS, Manhattan Associates, Excel, Power BI, Tableau',
  'Certifications: Forklift, IOSH Managing Safely, First Aid, HACCP Level 3',
  'Sectors: Retail Distribution, Cold Chain, Third Party Logistics, E-commerce',
];
const german = [
  'Kenntnisse: Lagerverwaltung, Bedarfsplanung, Tourenplanung, Bestandskontrolle',
  'Ausbildung: Diplom Logistikmanagement, Universitaet Koeln',
];

for (const tierName of Object.keys(TIERS)) {
  const eld = TIERS[tierName];
  for (const repeats of [1, 4, 12]) {
    const lines = ['Anneliese Vogt', 'Contact: a.v@example.com'];
    for (let i = 0; i < repeats; i++) lines.push(...english);
    lines.push(...german);
    const document = lines.join('\n');

    for (const conditioning of ['raw', 'stripped']) {
      for (const reliableFilter of [false, true]) {
        const segments = segmentsFor('windows100', document);
        const caught = segments.some((s) => classify(eld, s.text, conditioning, reliableFilter) === 'other');
        console.log(`tier=${tierName} repeats=${repeats} cond=${conditioning} relOnly=${reliableFilter} -> caught=${caught} (nSegments=${segments.length})`);
      }
    }
  }
}
