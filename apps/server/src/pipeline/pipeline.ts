import { unreadableSectionAttributes } from '../ingestion/unreadableSections.js';
import {
  extractAttributes,
  scoreCandidate,
  type Candidate as ScoringCandidate,
  type ExtractedAttribute,
  type Job as ScoringJob,
  type ScoreResult,
} from '@matchdesk/core';
import type Database from 'better-sqlite3';

import { extractText, type ExtractionResult } from '../ingestion/extractText.js';
import { createOrGetCandidate } from '../repositories/candidates.js';
import { createJob, getJobById } from '../repositories/jobs.js';
import { upsertMatch } from '../repositories/matches.js';
import type { Candidate as StoredCandidate, Job as StoredJob } from '../repositories/types.js';

/**
 * The pipeline: document bytes -> text -> stored candidate -> attributes ->
 * score -> persisted match (ADR-023 Decision 2).
 *
 * **This module is the first place `apps/server` imports `@matchdesk/core`.**
 * Until it existed, the scoring engine and the ingestion/storage layer had
 * never exchanged a function call, and ADR-018's restated invariant — the one
 * that matters, `text in -> score out` — could not be tested at any level.
 *
 * Deliberately NOT an HTTP server, a UI or a launcher. It is the smallest
 * thing that makes the existing rigour reach end-to-end behaviour.
 *
 * **C7 is enforced here, not assumed.** `extractText` decides whether a
 * document is readable; this module refuses to score anything it did not
 * approve, and records the refusal rather than a number. That check is the
 * single point where all the ingestion-side guards (scan detection, language
 * detection, the ADR-022 mixed-language veto) actually take effect on a score.
 */

/** Engine identity persisted with every score, so a stored match can be told
 *  apart from one produced by a later revision (ADR-002). */
export const ENGINE_VERSION = 'rules-1';

export interface ReferenceDate {
  readonly year: number;
  readonly month: number;
}

/**
 * The stored form of a reference date, `YYYY-MM`.
 *
 * Persisted with every score because extraction is a function of
 * `(rawText, referenceDate)` and a score is only explainable if you can
 * re-derive exactly what produced it (ADR-024, closing H-052). `rawText` is
 * content-addressed, `engineVersion` is already on the row, and this is the
 * third and last input.
 */
export function formatReferenceDate(referenceDate: ReferenceDate): string {
  return `${String(referenceDate.year).padStart(4, '0')}-${String(referenceDate.month).padStart(2, '0')}`;
}

/**
 * Reads a stored `YYYY-MM` back into a reference date, or `null` if the value
 * is absent or malformed.
 *
 * This is the other half of the guarantee that replaces `candidate_attributes`:
 * given a stored match, a caller can recover the exact inputs — `rawText` from
 * the candidate row, `engineVersion` and `referenceDate` from the match row —
 * and re-derive both the evidence and the number. `null` means the score
 * predates the column and is NOT reproducible, which callers must surface
 * rather than paper over.
 */
export function parseReferenceDate(stored: string | null): ReferenceDate | null {
  if (stored === null) return null;

  const match = /^(\d{4})-(\d{2})$/.exec(stored);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  return { year, month };
}

export type IngestOutcome = 'scoreable' | 'needs_attention' | 'failed';

export interface IngestedCandidate {
  readonly candidate: StoredCandidate;
  readonly outcome: IngestOutcome;
  /** Extracted attributes — empty whenever the document was not scoreable. */
  readonly attributes: readonly ExtractedAttribute[];
  readonly extraction: ExtractionResult;
  readonly alreadyExisted: boolean;
}

/**
 * A document is scoreable only when extraction returned `ok` AND confirmed
 * English. Both conditions are checked; `parseStatus` alone is not enough,
 * because a future extractor could report `ok` without a language verdict and
 * silently re-open the C7 hole ADR-006 and ADR-022 exist to close.
 */
function isScoreable(extraction: ExtractionResult): boolean {
  return extraction.parseStatus === 'ok' && extraction.language === 'en';
}

function outcomeOf(extraction: ExtractionResult): IngestOutcome {
  if (isScoreable(extraction)) return 'scoreable';
  return extraction.parseStatus === 'failed' ? 'failed' : 'needs_attention';
}

/**
 * Ingests one candidate document: extracts text and stores the candidate plus
 * the original bytes.
 *
 * **Attributes are returned, never persisted** (ADR-024). They are a pure
 * function of the stored `rawText` and the caller's `referenceDate`, so
 * storing them would create a second copy that goes stale the moment those
 * inputs change — which is exactly what H-052 measured: stored evidence
 * reading 7 years beside a score computed from 21, simply because time had
 * passed between ingest and re-score. Deriving on demand makes that
 * divergence impossible rather than merely detectable.
 */
export async function ingestCandidateDocument(
  db: Database.Database,
  filesDir: string,
  bytes: Buffer,
  originalFilename: string,
  referenceDate: ReferenceDate,
): Promise<IngestedCandidate> {
  const extraction = await extractText(bytes, originalFilename);

  const { candidate, alreadyExisted } = createOrGetCandidate(db, filesDir, {
    fileBytes: bytes,
    originalFilename,
    rawText: extraction.text,
    parseStatus: extraction.parseStatus,
    parseConfidence: extraction.parseConfidence,
    warnings: [...extraction.warnings],
    language: extraction.language,
  });

  const outcome = outcomeOf(extraction);
  if (outcome !== 'scoreable') {
    return { candidate, outcome, attributes: [], extraction, alreadyExisted };
  }

  // Nothing branches on `alreadyExisted` any more: with no stored copy to
  // reconcile, a re-upload of identical bytes derives the same attributes as
  // the first upload did. The flag is still reported so a caller can say
  // "already uploaded on <date>" instead of silently creating a duplicate.
  return {
    candidate,
    outcome,
    attributes: attributesWithUnreadable(candidate.rawText, referenceDate),
    extraction,
    alreadyExisted,
  };
}

export interface IngestedJob {
  readonly job: StoredJob;
  readonly outcome: IngestOutcome;
  readonly extraction: ExtractionResult;
}

/**
 * Ingests one job description. Same readability rules as a candidate: a job
 * we could not fully read is not a job we can derive requirements from.
 *
 * Requirement proposal is NOT done here. `docs/PRODUCT_DECISIONS.md` requires
 * the recruiter to review and confirm source-backed requirements before
 * scoring, so inventing them at ingest would prejudge a decision that is
 * explicitly theirs.
 */
export async function ingestJobDocument(
  db: Database.Database,
  filesDir: string,
  bytes: Buffer,
  originalFilename: string,
  title: string,
): Promise<IngestedJob> {
  const extraction = await extractText(bytes, originalFilename);

  const job = createJob(db, filesDir, {
    title,
    fileBytes: bytes,
    originalFilename,
    rawText: extraction.text,
    parseStatus: extraction.parseStatus,
    parseConfidence: extraction.parseConfidence,
    warnings: [...extraction.warnings],
    language: extraction.language,
  });

  return { job, outcome: outcomeOf(extraction), extraction };
}

export interface ScoredPair {
  readonly jobId: string;
  readonly candidateId: string;
  readonly result: ScoreResult;
}

/**
 * C7 applies to the JOB as well as the candidate (H-049).
 *
 * The first version of this pipeline enforced readability on the candidate
 * only. An adversarial probe ingested a FRENCH job description — stored with
 * `parseStatus="needs_attention"`, `language=null` — and scored a candidate
 * against it: **score 100, persisted match row, no warning.** The requirements
 * being scored against came from a document the tool could not read, so every
 * number under that job was untraceable to any source the recruiter could
 * check. That is the same C7 failure ADR-006 and ADR-022 close on the
 * candidate side, on the axis nobody had tested.
 */
function assertJobReadable(db: Database.Database, jobId: string): void {
  const stored = getJobById(db, jobId);
  if (stored === null) {
    throw new Error(
      `refusing to score against job "${jobId}": no such job row. A score that references ` +
        'no job is traceable to nothing.',
    );
  }
  if (stored.parseStatus !== 'ok' || stored.language !== 'en') {
    throw new Error(
      `refusing to score against job "${jobId}" with parseStatus="${stored.parseStatus}" ` +
        `language="${String(stored.language)}". Requirements derived from a document that was ` +
        'not fully read cannot produce a traceable score (C7).',
    );
  }
}

/**
 * Scores one (job, candidate) pair from stored state and persists the match.
 *
 * **`job.id` must be the id of a STORED job row.** `Job` here is the core
 * SCORING SPEC (weights and requirements) — a different type from the stored
 * job document that happens to share a name. The `matches` table has a
 * foreign key to `jobs(id)`, so passing a spec whose id is not a real job
 * fails loudly at insert rather than orphaning a score. That is the intended
 * behaviour, not an inconvenience: a score that references no job is not
 * traceable to anything.
 *
 * **Attributes are re-derived from stored `rawText` rather than read back from
 * `candidate_attributes`.** Those rows carry type + value + evidence span,
 * which is what a UI needs to render, but not the confidence, match type and
 * per-kind fields the scoring engine reads. Re-running extraction is safe
 * because it is pure and deterministic over the same text, and it keeps ONE
 * definition of what an attribute means rather than a second, subtly
 * different one that could drift. If this ever shows up in a profile, the fix
 * is a cache keyed by (text hash, engine version) — not a parallel
 * representation.
 */

/**
 * Extracted attributes, plus a record of any section the engine could not read
 * and found no other evidence for (H-041). Kept in one place so every entry
 * point derives the same attribute list — a second, subtly different derivation
 * is the H-099 shape, where the batch path and the single path disagreed.
 */
function attributesWithUnreadable(
  rawText: string,
  referenceDate: ReferenceDate,
): readonly ExtractedAttribute[] {
  const attributes = extractAttributes(rawText, { referenceDate });
  return [...attributes, ...unreadableSectionAttributes(rawText, attributes)];
}

export function scoreStoredPair(
  db: Database.Database,
  job: ScoringJob,
  candidate: StoredCandidate,
  referenceDate: ReferenceDate,
  computedAt: string,
): ScoredPair {
  assertJobReadable(db, job.id);

  if (candidate.parseStatus !== 'ok' || candidate.language !== 'en') {
    throw new Error(
      `scoreStoredPair: refusing to score candidate ${candidate.id} with ` +
        `parseStatus="${candidate.parseStatus}" language="${String(candidate.language)}". ` +
        'A document that was not fully read is never scored (C7).',
    );
  }

  const scoringCandidate: ScoringCandidate = {
    id: candidate.id,
    createdAt: candidate.createdAt,
    attributes: attributesWithUnreadable(candidate.rawText, referenceDate),
  };

  const result = scoreCandidate(job, scoringCandidate);

  // ADR-029 / H-040: a blocking reservation means the engine holds evidence it
  // could not reconcile AND that evidence would change the eligibility
  // verdict. Persisting the number here is exactly the failure H-040 records —
  // a confident 66/ineligible for a candidate the document says has twenty
  // years, decided by a date format the parser cannot read.
  //
  // This throws rather than storing a flagged row on purpose: `matches` has no
  // column for "provisional", and inventing one would put a number in the
  // database that something downstream will eventually read without the
  // caveat. H-066's `confidence` is the precedent — a field computed and read
  // by nothing is a trap, and a row nobody filters is the same trap inverted.
  const blocking = result.reservations.filter((r) => r.blocking);
  if (blocking.length > 0) {
    throw new Error(
      `scoreStoredPair: refusing to score candidate ${candidate.id} against job ${job.id}. ` +
        blocking.map((r) => r.detail).join(' ') +
        ' Scoring it would assert a number the document contradicts (C7, ADR-029).',
    );
  }

  upsertMatch(db, {
    jobId: job.id,
    candidateId: candidate.id,
    score: result.score,
    engineVersion: ENGINE_VERSION,
    embeddingModelRevision: null,
    computedAt,
    referenceDate: formatReferenceDate(referenceDate),
  });

  return { jobId: job.id, candidateId: candidate.id, result };
}

/**
 * Scores one job against many candidates, extracting each candidate's
 * attributes exactly ONCE.
 *
 * **Not a premature optimisation — a measured one.** `scripts/measure-matrix.mjs`
 * on 200 x 200:
 *
 *     extraction, once per candidate   152 ms   (0.76 ms/document)
 *     scoring, 40,000 pairs, reused    0.18 s   (0.005 ms/pair)
 *     first fill                       0.34 s
 *     re-extracting per pair           5.3 s    (15.8x slower)
 *
 * Extraction dominates scoring by roughly 150x per operation, so calling
 * {@link scoreStoredPair} in a loop re-does the expensive half N times per
 * candidate. Both shapes are fast enough at v1 scale; the ratio is what
 * matters, because it only grows once embeddings join the cascade.
 *
 * Candidates that are not scoreable are SKIPPED, not scored as zero. A zero
 * is a claim about a candidate; a skip is a statement that we could not read
 * their document (C7). Their ids are returned so the caller can show them in
 * the needs-attention tray.
 */
export interface SkippedCandidate {
  readonly candidateId: string;
  /**
   * `not_scoreable`: ingestion already refused the document (its own
   * `parseStatus`/`warnings` carry the reason). `blocking_reservation`: the
   * engine could read it but refuses to assert a number (ADR-029/032/034);
   * `details` are the reservation sentences, written for the recruiter.
   */
  readonly reason: 'not_scoreable' | 'blocking_reservation';
  readonly details: readonly string[];
}

export function scoreJobAgainstCandidates(
  db: Database.Database,
  job: ScoringJob,
  candidates: readonly StoredCandidate[],
  referenceDate: ReferenceDate,
  computedAt: string,
): { readonly scored: readonly ScoredPair[]; readonly skipped: readonly SkippedCandidate[] } {
  // Guarded identically to the single-pair path — an unreadable job must not
  // become scoreable simply by using the batch entry point (H-049).
  assertJobReadable(db, job.id);

  const scored: ScoredPair[] = [];
  const skipped: SkippedCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.parseStatus !== 'ok' || candidate.language !== 'en') {
      skipped.push({ candidateId: candidate.id, reason: 'not_scoreable', details: [] });
      continue;
    }

    const scoringCandidate: ScoringCandidate = {
      id: candidate.id,
      createdAt: candidate.createdAt,
      attributes: attributesWithUnreadable(candidate.rawText, referenceDate),
    };
    const result = scoreCandidate(job, scoringCandidate);

    // ADR-029 / H-040, and H-099: the single-pair path refuses to persist a
    // blocking reservation, and this path did not. Same job, same candidate,
    // same reference date: `scoreStoredPair` threw and wrote nothing, while
    // this function wrote score 64 to `matches`. Since this is the entry point
    // a "score this job against my pool" action uses, the guarantee ADR-029
    // records was reachable only by the path nobody calls.
    //
    // This SKIPS rather than throwing, which is the one place it deliberately
    // differs from the single-pair path. The invariant that matters is
    // identical — no row is persisted — but a batch must not let one
    // unreconcilable candidate deny service to the rest of the pool, and this
    // function already has the right channel for it: `skipped` means "we could
    // not read this document", which is exactly what an unreconciled
    // reservation says. They land in the needs-attention tray with the others.
    const blocking = result.reservations.filter((r) => r.blocking);
    if (blocking.length > 0) {
      skipped.push({
        candidateId: candidate.id,
        reason: 'blocking_reservation',
        details: blocking.map((r) => r.detail),
      });
      continue;
    }

    upsertMatch(db, {
      jobId: job.id,
      candidateId: candidate.id,
      score: result.score,
      engineVersion: ENGINE_VERSION,
      embeddingModelRevision: null,
      computedAt,
      referenceDate: formatReferenceDate(referenceDate),
    });

    scored.push({ jobId: job.id, candidateId: candidate.id, result });
  }

  return { scored, skipped };
}
