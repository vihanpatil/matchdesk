#!/usr/bin/env node
/**
 * Measures the 200 x 200 matrix first-fill cost (HONESTY_LOG H-008, ADR-023).
 *
 * Section 11 budgets the matrix at "< 5 s from cache" and says nothing at all
 * about populating it. H-008 flagged that 40,000 score computations might make
 * the first fill take minutes, and that the number had never been measured.
 * This measures it, on synthetic CV text, and prints numbers rather than
 * reassurance.
 *
 * Synthetic input only — ADR-014: the repo is public, no real CV ever runs
 * through anything committed here.
 *
 * Usage: node scripts/measure-matrix.mjs [jobs] [candidates]
 */

import { performance } from 'node:perf_hooks';

import { extractAttributes, scoreCandidate } from '../packages/core/dist/index.js';

const JOBS = Number(process.argv[2] ?? 200);
const CANDIDATES = Number(process.argv[3] ?? 200);
const REF = { referenceDate: { year: 2026, month: 1 } };

const SKILLS = [
  'Python',
  'JavaScript',
  'TypeScript',
  'Java',
  'Go',
  'SQL',
  'React',
  'Docker',
  'Kubernetes',
  'AWS',
];

/**
 * A CV of realistic length and shape — deterministic, varied per index.
 * @param {number} i
 * @returns {string}
 */
function syntheticCv(i) {
  const pick = (/** @type {number} */ n) => SKILLS[n % SKILLS.length] ?? 'Python';
  const picked = [pick(i), pick(i + 3), pick(i + 7)];
  return `Candidate Number ${String(i)}

Skills
${picked.join(', ')}

Experience
Senior Software Engineer
Jan ${String(2012 + (i % 8))} - Dec ${String(2020 + (i % 4))}
Built and maintained backend services, mentored junior engineers, and led the
migration of a monolithic service to an event-driven architecture handling
several million transactions per day.

Software Engineer
Mar ${String(2008 + (i % 4))} - Dec ${String(2011 + (i % 3))}
Worked across the stack on customer-facing features and internal tooling.

Education
BSc Computer Science, University of Somewhere

Certifications
AWS Certified Solutions Architect - Associate`;
}

/**
 * @param {number} i
 * @returns {import('../packages/core/dist/index.js').Job}
 */
function syntheticJob(i) {
  return {
    id: `job-${String(i)}`,
    skills: {
      weight: 0.4,
      requirements: [
        { id: `r-${String(i)}-1`, canonicalSkillId: 'python', label: 'Python', mustHave: false },
        { id: `r-${String(i)}-2`, canonicalSkillId: 'sql', label: 'SQL', mustHave: i % 5 === 0 },
      ],
    },
    experience: { weight: 0.3, requirement: { minYears: 3 + (i % 5) } },
    seniority: { weight: 0.1, requirement: { level: 'senior' } },
  };
}

/**
 * @param {number} start
 * @returns {number}
 */
function ms(start) {
  return Number((performance.now() - start).toFixed(1));
}

console.log(`Matrix measurement: ${String(JOBS)} jobs x ${String(CANDIDATES)} candidates`);
console.log(`Total pairs: ${String(JOBS * CANDIDATES)}\n`);

// ---- 1. Extraction, once per candidate -----------------------------------
const texts = Array.from({ length: CANDIDATES }, (_, i) => syntheticCv(i));

let t = performance.now();
const extracted = texts.map((text, i) => ({
  id: `cand-${String(i)}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  attributes: extractAttributes(text, REF),
}));
const extractMs = ms(t);
console.log(`Extraction (${String(CANDIDATES)} documents, once each)`);
console.log(
  `  total ${String(extractMs)} ms   per document ${(extractMs / CANDIDATES).toFixed(2)} ms`,
);

// ---- 2. Scoring, every pair, attributes reused ---------------------------
const jobs = Array.from({ length: JOBS }, (_, i) => syntheticJob(i));

t = performance.now();
let checksum = 0;
for (const job of jobs) {
  for (const candidate of extracted) {
    checksum += scoreCandidate(job, candidate).score;
  }
}
const scoreMs = ms(t);
const pairs = JOBS * CANDIDATES;
console.log(`\nScoring (attributes extracted ONCE per candidate, reused across jobs)`);
console.log(
  `  total ${(scoreMs / 1000).toFixed(2)} s   per pair ${(scoreMs / pairs).toFixed(3)} ms`,
);
console.log(`  first fill = extraction + scoring = ${((extractMs + scoreMs) / 1000).toFixed(2)} s`);

// ---- 3. The naive shape: re-extract per pair -----------------------------
// This is what `scoreStoredPair` does when called in a loop, and the reason
// the matrix driver must not be written that way. Measured on a small sample
// and extrapolated, because running it in full would take far too long.
const SAMPLE = 200;
t = performance.now();
for (let i = 0; i < SAMPLE; i++) {
  const text = texts[i % texts.length] ?? '';
  const candidate = {
    id: 'c',
    createdAt: '2026-01-01T00:00:00.000Z',
    attributes: extractAttributes(text, REF),
  };
  const job = jobs[i % jobs.length];
  if (job === undefined) continue;
  checksum += scoreCandidate(job, candidate).score;
}
const naivePerPair = ms(t) / SAMPLE;
console.log(`\nNaive shape (re-extracting per pair — what a loop over scoreStoredPair does)`);
console.log(`  per pair ${naivePerPair.toFixed(3)} ms`);
console.log(`  extrapolated first fill ${((naivePerPair * pairs) / 1000).toFixed(1)} s`);
console.log(
  `  ${(((naivePerPair * pairs) / (extractMs + scoreMs)) * 1).toFixed(1)}x slower than reusing attributes`,
);

console.log(`\n(checksum ${String(checksum)} — printed only so nothing is optimised away)`);
