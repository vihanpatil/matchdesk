const SPIKE_ELD = '/private/tmp/claude-501/-Users-vihanpatil-personal-projects-Resume-Match/03221b5a-e8b7-471c-8d49-a8e92397019d/scratchpad/dep-analyst/spike/node_modules/eld';
const { eld } = await import(`${SPIKE_ELD}/src/entries/static.small.js`);

const lines = [
  'Dmitri Karalis - Head Chef',
  '- Trained six commis chefs to chef de partie level',
  'Kwabena Boateng - HGV Driver',
];
for (const l of lines) {
  const r = eld.detect(l);
  console.log(JSON.stringify(l), '->', r.language, 'reliable=', r.isReliable(), 'scores=', r.getScores());
}
