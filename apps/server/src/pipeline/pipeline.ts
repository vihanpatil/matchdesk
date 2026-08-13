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
import { addCandidateAttribute } from '../repositories/candidateAttributes.js';
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
 * Ingests one candidate document: extracts text, stores the candidate and the
 * original bytes, and — only if the document is scoreable — extracts and
 * persists its attributes.
 *
 * Attributes are persisted with their evidence spans, which index `rawText` as
 * stored. That is what keeps "every number traces to a highlighted span in the
 * source" true across a restart rather than only within one process.
 */
export async function ingestCandidateDocument(
  db: Database.Database,
  filesDir: string,
  bytes: Buffer,
  originalFilename: string,
  referenceDate: { readonly year: number; readonly month: number },
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

  // Re-uploading identical bytes must not duplicate attribute rows. The
  // candidate is content-addressed, so the attributes already on record were
  // derived from exactly this text by exactly this extractor.
  if (alreadyExisted) {
    return {
      candidate,
      outcome,
      attributes: extractAttributes(candidate.rawText, { referenceDate }),
      extraction,
      alreadyExisted,
    };
  }

  const attributes = extractAttributes(candidate.rawText, { referenceDate });
  for (const attribute of attributes) {
    addCandidateAttribute(db, {
      candidateId: candidate.id,
      attributeType: attribute.kind,
      value: attribute.normalizedValue,
      evidenceStart: attribute.sourceSpan.start,
      evidenceEnd: attribute.sourceSpan.end,
    });
  }

  return { candidate, outcome, attributes, extraction, alreadyExisted };
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
export function scoreStoredPair(
  db: Database.Database,
  job: ScoringJob,
  candidate: StoredCandidate,
  referenceDate: { readonly year: number; readonly month: number },
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
    attributes: extractAttributes(candidate.rawText, { referenceDate }),
  };

  const result = scoreCandidate(job, scoringCandidate);

  upsertMatch(db, {
    jobId: job.id,
    candidateId: candidate.id,
    score: result.score,
    engineVersion: ENGINE_VERSION,
    embeddingModelRevision: null,
    computedAt,
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
export function scoreJobAgainstCandidates(
  db: Database.Database,
  job: ScoringJob,
  candidates: readonly StoredCandidate[],
  referenceDate: { readonly year: number; readonly month: number },
  computedAt: string,
): { readonly scored: readonly ScoredPair[]; readonly skipped: readonly string[] } {
  // Guarded identically to the single-pair path — an unreadable job must not
  // become scoreable simply by using the batch entry point (H-049).
  assertJobReadable(db, job.id);

  const scored: ScoredPair[] = [];
  const skipped: string[] = [];

  for (const candidate of candidates) {
    if (candidate.parseStatus !== 'ok' || candidate.language !== 'en') {
      skipped.push(candidate.id);
      continue;
    }

    const scoringCandidate: ScoringCandidate = {
      id: candidate.id,
      createdAt: candidate.createdAt,
      attributes: extractAttributes(candidate.rawText, { referenceDate }),
    };
    const result = scoreCandidate(job, scoringCandidate);

    upsertMatch(db, {
      jobId: job.id,
      candidateId: candidate.id,
      score: result.score,
      engineVersion: ENGINE_VERSION,
      embeddingModelRevision: null,
      computedAt,
    });

    scored.push({ jobId: job.id, candidateId: candidate.id, result });
  }

  return { scored, skipped };
}
