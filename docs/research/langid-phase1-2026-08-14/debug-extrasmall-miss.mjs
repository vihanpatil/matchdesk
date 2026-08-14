const SPIKE_ELD = '/private/tmp/claude-501/-Users-vihanpatil-personal-projects-Resume-Match/03221b5a-e8b7-471c-8d49-a8e92397019d/scratchpad/dep-analyst/spike/node_modules/eld';
const { eld } = await import(`${SPIKE_ELD}/src/entries/static.extrasmall.js`);
const line = 'Werkervaring: Softwareontwikkeling, Systeembeheer';
const r = eld.detect(line);
console.log(r.language, r.isReliable(), r.getScores());
console.log(eld.info());
