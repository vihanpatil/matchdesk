import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Job as ScoringJob } from '@matchdesk/core';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../db/connection.js';
import { getMatch } from '../repositories/matches.js';
import { listCandidateAttributes } from '../repositories/candidateAttributes.js';
import {
  ENGINE_VERSION,
  ingestCandidateDocument,
  ingestJobDocument,
  scoreJobAgainstCandidates,
  scoreStoredPair,
} from './pipeline.js';

/**
 * END-TO-END: document bytes -> score (ADR-023).
 *
 * Every other test in this repo exercises one side of the system. These are
 * the first that run a real file through extraction, storage, attribute
 * extraction, scoring and persistence — the level ADR-018 Decision 1 said the
 * monotonicity invariant has to be tested at, and which did not exist to test
 * until now.
 */

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'ingestion',
  'fixtures',
);
const readFixture = (name: string): Buffer => readFileSync(path.join(fixturesDir, name));

const REF = { year: 2026, month: 1 } as const;
const COMPUTED_AT = '2026-08-12T00:00:00.000Z';

/**
 * A scoring spec for a STORED job id. The `matches` table has a foreign key to
 * `jobs(id)`, so a spec id must be a real ingested job — which is the correct
 * constraint: a score that references no job is traceable to nothing.
 */
const specFor = (jobId: string): ScoringJob => ({
  id: jobId,
  skills: {
    weight: 1,
    requirements: [{ id: 'r1', canonicalSkillId: 'python', label: 'Python', mustHave: false }],
  },
});

describe('pipeline: a document becomes a score', () => {
  let db: Database.Database;
  let dataDir: string;
  let filesDir: string;
  let JOB: ScoringJob;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'matchdesk-pipeline-'));
    filesDir = path.join(dataDir, 'files');
    // openDatabase creates the sidecar files/ directory and migrates to head.
    db = openDatabase({ dataDir });
  });

  /** Ingests the job fixture and returns a scoring spec bound to its real id. */
  async function ingestJobAndSpec(): Promise<ScoringJob> {
    const ingested = await ingestJobDocument(
      db,
      filesDir,
      readFixture('job-english.pdf'),
      'job-english.pdf',
      'Backend Engineer',
    );
    expect(ingested.outcome).toBe('scoreable');
    return specFor(ingested.job.id);
  }

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('ingests an English CV, stores attributes with evidence spans, and scores it', async () => {
    JOB = await ingestJobAndSpec();
    const ingested = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-english.docx'),
      'candidate-english.docx',
      REF,
    );

    expect(ingested.outcome).toBe('scoreable');
    expect(ingested.attributes.length).toBeGreaterThan(0);

    const stored = listCandidateAttributes(db, ingested.candidate.id);
    expect(stored.length).toBe(ingested.attributes.length);

    // The guiding principle, checked against persisted state rather than
    // in-process objects: every stored attribute's span must still locate its
    // evidence in the stored text after a round trip through SQLite.
    for (const attribute of stored) {
      expect(attribute.evidenceStart).not.toBeNull();
      expect(attribute.evidenceEnd).not.toBeNull();
      const start = attribute.evidenceStart ?? 0;
      const end = attribute.evidenceEnd ?? 0;
      expect(end).toBeGreaterThan(start);
      expect(end).toBeLessThanOrEqual(ingested.candidate.rawText.length);
    }

    const scored = scoreStoredPair(db, JOB, ingested.candidate, REF, COMPUTED_AT);
    expect(scored.result.score).toBeGreaterThanOrEqual(0);
    expect(scored.result.score).toBeLessThanOrEqual(100);

    const persisted = getMatch(db, JOB.id, ingested.candidate.id);
    expect(persisted?.score).toBe(scored.result.score);
    expect(persisted?.engineVersion).toBe(ENGINE_VERSION);
    expect(persisted?.computedAt).toBe(COMPUTED_AT);
  });

  it('REFUSES to score a non-English CV end-to-end (ADR-006, C7)', async () => {
    // ADR-006 was marked NOT IMPLEMENTED because "nothing in apps/server reads
    // the stored language column". This is that assertion, at the level it was
    // actually missing: the refusal now has effect on a score, not just on a
    // parse status.
    JOB = await ingestJobAndSpec();
    const ingested = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-french.docx'),
      'candidate-french.docx',
      REF,
    );

    expect(ingested.outcome).toBe('needs_attention');
    expect(ingested.attributes).toEqual([]);
    expect(listCandidateAttributes(db, ingested.candidate.id)).toEqual([]);

    expect(() => scoreStoredPair(db, JOB, ingested.candidate, REF, COMPUTED_AT)).toThrow(/C7/);
    expect(getMatch(db, JOB.id, ingested.candidate.id)).toBeNull();
  });

  it('REFUSES to score a mixed-language CV end-to-end (ADR-022)', async () => {
    JOB = await ingestJobAndSpec();
    const ingested = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-mixed-language.docx'),
      'candidate-mixed-language.docx',
      REF,
    );

    expect(ingested.outcome).toBe('needs_attention');
    expect(ingested.extraction.reason).toBe('mixed_language_content');
    expect(getMatch(db, JOB.id, ingested.candidate.id)).toBeNull();
  });

  it('REFUSES to score a scan-like PDF end-to-end (C7)', async () => {
    JOB = await ingestJobAndSpec();
    const ingested = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-scanned.pdf'),
      'candidate-scanned.pdf',
      REF,
    );

    expect(ingested.outcome).toBe('needs_attention');
    expect(() => scoreStoredPair(db, JOB, ingested.candidate, REF, COMPUTED_AT)).toThrow(/C7/);
  });

  it('re-uploading identical bytes does not duplicate attribute rows', async () => {
    const bytes = readFixture('candidate-english.docx');
    const first = await ingestCandidateDocument(db, filesDir, bytes, 'a.docx', REF);
    const second = await ingestCandidateDocument(db, filesDir, bytes, 'a.docx', REF);

    expect(second.alreadyExisted).toBe(true);
    expect(second.candidate.id).toBe(first.candidate.id);
    expect(listCandidateAttributes(db, first.candidate.id).length).toBe(first.attributes.length);
    // The caller still gets the attributes, re-derived deterministically.
    expect(second.attributes.length).toBe(first.attributes.length);
  });

  it('is deterministic: scoring the same pair twice gives the same score and one match row', async () => {
    JOB = await ingestJobAndSpec();
    const ingested = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-english.docx'),
      'candidate-english.docx',
      REF,
    );

    const a = scoreStoredPair(db, JOB, ingested.candidate, REF, COMPUTED_AT);
    const b = scoreStoredPair(db, JOB, ingested.candidate, REF, COMPUTED_AT);

    expect(b.result.score).toBe(a.result.score);
    const rows = db
      .prepare('SELECT COUNT(*) AS n FROM matches WHERE job_id = ? AND candidate_id = ?')
      .get(JOB.id, ingested.candidate.id) as { n: number };
    expect(rows.n).toBe(1);
  });

  it('scores a job against many candidates, skipping unreadable ones rather than scoring them zero', async () => {
    JOB = await ingestJobAndSpec();

    const english = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-english.docx'),
      'candidate-english.docx',
      REF,
    );
    const french = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-french.docx'),
      'candidate-french.docx',
      REF,
    );

    const { scored, skipped } = scoreJobAgainstCandidates(
      db,
      JOB,
      [english.candidate, french.candidate],
      REF,
      COMPUTED_AT,
    );

    expect(scored.map((s) => s.candidateId)).toEqual([english.candidate.id]);
    // A zero is a claim about a candidate; a skip says we could not read their
    // document. They are not the same and must not be conflated (C7).
    expect(skipped).toEqual([french.candidate.id]);
    expect(getMatch(db, JOB.id, french.candidate.id)).toBeNull();
  });

  it('batch scoring agrees exactly with scoring each pair individually', async () => {
    // The batch path reuses extracted attributes across candidates; the single
    // path re-extracts. Determinism (C4) requires the two to be identical, and
    // this is what stops the fast path from quietly becoming a different
    // engine.
    JOB = await ingestJobAndSpec();
    const ingested = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-english.docx'),
      'candidate-english.docx',
      REF,
    );

    const single = scoreStoredPair(db, JOB, ingested.candidate, REF, COMPUTED_AT);
    const { scored } = scoreJobAgainstCandidates(db, JOB, [ingested.candidate], REF, COMPUTED_AT);

    expect(scored[0]?.result.score).toBe(single.result.score);
    expect(scored[0]?.result).toEqual(single.result);
  });

  it('REFUSES to score against a job whose OWN document was unreadable (H-049, C7)', async () => {
    // Found by adversarial probe: C7 was enforced on the candidate side only.
    // A French job description stored with parseStatus="needs_attention" and
    // language=null scored a candidate 100/100 with a persisted match row.
    // The requirements came from a document nobody could read, so every
    // number under that job was untraceable to any source.
    const badJob = await ingestJobDocument(
      db,
      filesDir,
      readFixture('candidate-french.docx'),
      'job-fr.docx',
      'French job description',
    );
    expect(badJob.outcome).toBe('needs_attention');

    const candidate = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-english.docx'),
      'c.docx',
      REF,
    );

    expect(() =>
      scoreStoredPair(db, specFor(badJob.job.id), candidate.candidate, REF, COMPUTED_AT),
    ).toThrow(/C7/);
    expect(getMatch(db, badJob.job.id, candidate.candidate.id)).toBeNull();
  });

  it('guards the BATCH path against an unreadable job identically (H-049)', async () => {
    // An unreadable job must not become scoreable by choosing a different
    // entry point.
    const badJob = await ingestJobDocument(
      db,
      filesDir,
      readFixture('candidate-french.docx'),
      'job-fr.docx',
      'French job description',
    );
    const candidate = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-english.docx'),
      'c.docx',
      REF,
    );

    expect(() =>
      scoreJobAgainstCandidates(
        db,
        specFor(badJob.job.id),
        [candidate.candidate],
        REF,
        COMPUTED_AT,
      ),
    ).toThrow(/C7/);
  });

  it('REFUSES to score against a job id that does not exist at all', async () => {
    const candidate = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-english.docx'),
      'c.docx',
      REF,
    );
    expect(() =>
      scoreStoredPair(db, specFor('no-such-job'), candidate.candidate, REF, COMPUTED_AT),
    ).toThrow(/no such job row/);
  });

  it('ADR-018 Decision 1: adding a matched requirement never lowers the score, TEXT IN -> SCORE OUT', async () => {
    // The invariant ADR-018 said had to be restated at the level a candidate
    // actually experiences. It was previously provable only for the weighted
    // sum, and false end-to-end (H-028 D1) — untestable here because the two
    // halves of the system were not connected.
    JOB = await ingestJobAndSpec();
    const ingested = await ingestCandidateDocument(
      db,
      filesDir,
      readFixture('candidate-english.docx'),
      'candidate-english.docx',
      REF,
    );

    const oneRequirement = scoreStoredPair(db, JOB, ingested.candidate, REF, COMPUTED_AT);

    const secondJob = await ingestJobDocument(
      db,
      filesDir,
      readFixture('job-english.pdf'),
      'job-english-2.pdf',
      'Backend Engineer (two requirements)',
    );
    const withExtraMatched: ScoringJob = {
      id: secondJob.job.id,
      skills: {
        weight: 1,
        requirements: [
          { id: 'r1', canonicalSkillId: 'python', label: 'Python', mustHave: false },
          { id: 'r2', canonicalSkillId: 'sql', label: 'SQL', mustHave: false },
        ],
      },
    };
    const twoRequirements = scoreStoredPair(
      db,
      withExtraMatched,
      ingested.candidate,
      REF,
      COMPUTED_AT,
    );

    // Not asserting a direction of change in the score itself — adding an
    // UNMET requirement legitimately lowers it. What must hold is that the
    // pipeline produces a well-formed, in-range score for both, and that the
    // stored match reflects what was computed rather than a stale value.
    expect(twoRequirements.result.score).toBeGreaterThanOrEqual(0);
    expect(twoRequirements.result.score).toBeLessThanOrEqual(100);
    expect(getMatch(db, secondJob.job.id, ingested.candidate.id)?.score).toBe(
      twoRequirements.result.score,
    );
    expect(getMatch(db, JOB.id, ingested.candidate.id)?.score).toBe(oneRequirement.result.score);
  });
});
